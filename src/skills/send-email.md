---
name: send-email
description: Send an email message through the configured external messaging system
parameters:
  - name: to
    type: string
    description: Recipient email address
    required: true
  - name: subject
    type: string
    description: Email subject line
    required: true
  - name: bodyHtml
    type: string
    description: HTML content for the email body
    required: true
---
