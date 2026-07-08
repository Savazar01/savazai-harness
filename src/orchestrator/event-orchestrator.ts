import { z } from "zod";
import { skillTools } from "../utils/skills-loader.js";

export const DayScheduleSchema = z.object({
  day: z.number(),
  objectives: z.array(z.string()),
  requiredSkills: z.array(z.string()),
  status: z.enum(["pending", "processing", "completed", "failed"]),
});

export const OrchestratedEventSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  totalDays: z.number(),
  currentDay: z.number(),
  schedule: z.array(DayScheduleSchema),
});

export type DaySchedule = z.infer<typeof DayScheduleSchema>;
export type OrchestratedEvent = z.infer<typeof OrchestratedEventSchema>;

function generateId(): string {
  return crypto.randomUUID();
}

function inferSkills(objectives: string[]): string[] {
  const known = skillTools.map((t) => t.name);
  const matched = new Set<string>();
  for (const obj of objectives) {
    const lower = obj.toLowerCase();
    for (const skill of known) {
      const parts = skill.replace(/-/g, " ").toLowerCase().split(/\s+/);
      if (parts.some((p) => lower.includes(p))) {
        matched.add(skill);
      }
    }
  }
  return Array.from(matched);
}

function distributeObjectives(
  broadObjectives: string[],
  totalDays: number,
): { day: number; objectives: string[] }[] {
  const plan: { day: number; objectives: string[] }[] = [];
  for (let d = 1; d <= totalDays; d++) {
    const sliced = broadObjectives.slice(
      ((d - 1) * broadObjectives.length) / totalDays,
      (d * broadObjectives.length) / totalDays,
    );
    plan.push({
      day: d,
      objectives: sliced.length > 0 ? sliced : [`Continue execution for day ${d}`],
    });
  }
  return plan;
}

export class EventOrchestrator {
  private events = new Map<string, OrchestratedEvent>();

  initializeEvent(title: string, durationDays: number, broadObjectives: string[]): OrchestratedEvent {
    const id = generateId();
    const plan = distributeObjectives(broadObjectives, durationDays);
    const schedule: DaySchedule[] = plan.map((p) => ({
      day: p.day,
      objectives: p.objectives,
      requiredSkills: inferSkills(p.objectives),
      status: "pending" as const,
    }));

    if (schedule.length > 0) {
      schedule[0].status = "processing";
    }

    const event: OrchestratedEvent = {
      id,
      title,
      totalDays: durationDays,
      currentDay: 1,
      schedule,
    };

    this.events.set(id, event);
    return event;
  }

  async executeCurrentDayStep(eventId: string): Promise<OrchestratedEvent> {
    const event = this.events.get(eventId);
    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }

    const dayIndex = event.currentDay - 1;
    if (dayIndex < 0 || dayIndex >= event.schedule.length) {
      throw new Error(`Event ${eventId} has no schedule entry for day ${event.currentDay}`);
    }

    const day = event.schedule[dayIndex];
    if (day.status === "completed") {
      return event;
    }

    day.status = "processing";

    for (const skillName of day.requiredSkills) {
      const tool = skillTools.find((t) => t.name === skillName);
      if (tool) {
        await tool.execute({ objective: day.objectives.join("; ") }).catch(() => {});
      }
    }

    day.status = "completed";

    const nextDayIndex = dayIndex + 1;
    if (nextDayIndex < event.schedule.length) {
      event.schedule[nextDayIndex].status = "processing";
      event.currentDay = nextDayIndex + 1;
    } else {
      event.currentDay = event.totalDays;
    }

    this.events.set(eventId, event);
    return event;
  }

  getEvent(eventId: string): OrchestratedEvent | undefined {
    return this.events.get(eventId);
  }
}

export const eventOrchestrator = new EventOrchestrator();
