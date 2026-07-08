---
name: generate-pdf
description: Generate a PDF document from provided text content using a local Python script with ReportLab
parameters:
  - name: summaryText
    type: string
    description: The text content to render into the PDF
    required: true
  - name: title
    type: string
    description: The title heading for the PDF document
    required: false
  - name: filename
    type: string
    description: The desired output filename without extension
    required: false
---
