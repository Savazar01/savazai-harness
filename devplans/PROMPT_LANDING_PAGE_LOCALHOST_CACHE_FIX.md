# PROMPT: Diagnose & Render Landing Page Updates on localhost:3056, Invalidate Container Cache, and Verify Live HTML

## 1. Problem Statement & Symptoms
The user observed that recent enhancements made to the landing page are **not appearing when viewing `http://localhost:3056/`**.

Potential causes to diagnose immediately:
1. **Target File Discrepancy**: Confirming which file serves `GET /`: `savazai-console/src/app/page.tsx`, route groups, or nested components.
2. **Container Build Caching**: The Docker Compose container `savazai-harness-savazai-console-1` was built prior to the landing page changes. Running `npm run build` on the host machine builds locally into `./savazai-console/.next/` but does not update the container's internal standalone build unless the container image is rebuilt or restarted with updated build context.
3. **Next.js Static Generation / Cache**: Stale `.next` cache or container static pages.

## 2. DevPlans Workflow
- Maintain `/devplans/PROMPT_LANDING_PAGE_LOCALHOST_CACHE_FIX.md`
- Maintain `/devplans/PLAN_LANDING_PAGE_LOCALHOST_CACHE_FIX.md`
- Maintain `/devplans/WALKTHROUGH_LANDING_PAGE_LOCALHOST_CACHE_FIX.md`
- Synchronize knowledge graph via `graphify update .` upon completion.
