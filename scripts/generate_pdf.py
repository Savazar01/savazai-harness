import sys
import os
import json
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing summaryText argument"}))
        return

    summary_text = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else "SavazAI Report"
    filename = sys.argv[3] if len(sys.argv) > 3 else "report"

    # Ensure logs directory exists per Log Hygiene Policy
    os.makedirs("logs", exist_ok=True)
    pdf_filename = f"logs/{filename}.pdf"

    try:
        doc = SimpleDocTemplate(pdf_filename, pagesize=letter)
        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle(
            'TitleStyle',
            parent=styles['Heading1'],
            fontSize=24,
            leading=28,
            textColor='#4f46e5',
            spaceAfter=20
        )
        
        body_style = ParagraphStyle(
            'BodyStyle',
            parent=styles['BodyText'],
            fontSize=10,
            leading=14,
            textColor='#334155'
        )

        story = []
        story.append(Paragraph(title, title_style))
        story.append(Spacer(1, 10))
        
        # Format input text for paragraph rendering
        formatted_text = summary_text.replace("\n", "<br/>")
        story.append(Paragraph(formatted_text, body_style))
        
        doc.build(story)
        
        print(json.dumps({
            "success": True,
            "filePath": pdf_filename,
            "message": f"PDF successfully generated at {pdf_filename}"
        }))
    except Exception as e:
        print(json.dumps({"error": f"Failed to generate PDF: {str(e)}"}))

if __name__ == "__main__":
    main()
