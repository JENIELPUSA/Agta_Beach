
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Gmail API credentials
oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const gmail = google.gmail({
    version: 'v1',
    auth: oauth2Client
});

// Encode Base64 URL
const encodeMessage = (message) => {
    return Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

// Base64 line wrapping
const wrapBase64 = (value) => {
    return value.match(/.{1,76}/g)?.join('\r\n') || '';
};

// Escape HTML
const escapeHTML = (value = '') => {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
};

// Safe email header
const safeHeader = (value = '') => {
    return String(value).replace(/[\r\n]/g, '');
};

// Build attachment
const buildAttachment = async (file, boundary) => {
    let content = file.content;

    if (file.path) {
        content = await fs.promises.readFile(file.path);
    }

    if (!content) return '';

    if (!Buffer.isBuffer(content)) {
        content = Buffer.from(content);
    }

    const filename = path.basename(
        file.filename || 'attachment'
    ).replace(/["\r\n]/g, '_');

    const contentType =
        file.contentType || 'application/octet-stream';

    return [
        `--${boundary}`,
        `Content-Type: ${contentType}; name="${filename}"`,
        `Content-Disposition: attachment; filename="${filename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        wrapBase64(content.toString('base64')),
        ''
    ].join('\r\n');
};

const sendEmail = async (options) => {
    try {
        if (!process.env.EMAIL_USER) {
            throw new Error('EMAIL_USER is missing.');
        }

        if (!process.env.GOOGLE_CLIENT_ID ||
            !process.env.GOOGLE_CLIENT_SECRET ||
            !process.env.GOOGLE_REFRESH_TOKEN) {
            throw new Error('Gmail OAuth credentials are incomplete.');
        }

        if (!options.email) {
            throw new Error('Recipient email is required.');
        }

        if (!options.subject) {
            throw new Error('Email subject is required.');
        }

        const email = safeHeader(options.email);
        const subject = safeHeader(options.subject);
        const text = options.text || '';

        const currentYear = new Date().getFullYear();

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport"
                  content="width=device-width, initial-scale=1.0">

            <title>${escapeHTML(subject)}</title>

            <style>
                body {
                    margin: 0;
                    padding: 0;
                    font-family: Arial, sans-serif;
                    background-color: #f8fbfe;
                    color: #2d3748;
                }

                .container {
                    max-width: 600px;
                    margin: 20px auto;
                    border-radius: 4px;
                    overflow: hidden;
                    border: 1px solid #e2e8f0;
                }

                .header {
                    background: linear-gradient(135deg, #1d4e89, #0c3a6e);
                    padding: 30px 20px;
                    text-align: center;
                }

                .agency-name {
                    color: white;
                    font-size: 26px;
                    margin: 10px 0 5px;
                }

                .system-name {
                    color: white;
                    font-size: 15px;
                }

                .content {
                    padding: 35px;
                    background: white;
                    line-height: 1.6;
                }

                .greeting {
                    color: #1e293b;
                    font-size: 22px;
                }

                .message {
                    font-size: 16px;
                    color: #475569;
                    line-height: 1.7;
                }

                .info-card {
                    background: #f1f5f9;
                    border-radius: 6px;
                    padding: 20px;
                    margin: 25px 0;
                    border-left: 4px solid #1d4e89;
                }

                .info-label {
                    font-weight: bold;
                    color: #1e40af;
                    display: block;
                    margin-bottom: 5px;
                }

                .info-value {
                    font-size: 18px;
                    color: #1e293b;
                }

                .action-container {
                    text-align: center;
                    margin: 35px 0;
                }

                .action-btn {
                    display: inline-block;
                    background: #1d4e89;
                    color: white !important;
                    padding: 12px 32px;
                    border-radius: 4px;
                    text-decoration: none;
                    font-weight: bold;
                }

                .contact-info {
                    text-align: center;
                    margin-top: 30px;
                    color: #64748b;
                    border-top: 1px solid #e2e8f0;
                    padding-top: 20px;
                }

                .footer {
                    background: #f1f5f9;
                    padding: 25px;
                    text-align: center;
                    font-size: 13px;
                    color: #64748b;
                }
            </style>
        </head>

        <body>
            <div class="container">

                <div class="header">
                    <div style="font-size:42px;">🏖️</div>

                    <h1 class="agency-name">
                        Agta Beach Resort
                    </h1>

                    <p class="system-name">
                        Reservation and Booking Management System
                    </p>
                </div>

                <div class="content">

                    <h2 class="greeting">Greetings!</h2>

                    <div class="message">
                        ${text}
                    </div>

                    <div class="info-card">
                        <span class="info-label">
                            Booking Reference
                        </span>

                        <span class="info-value">
                            ${escapeHTML(subject)}
                        </span>
                    </div>

                    <p class="message">
                        This is an automated notification regarding
                        your reservation or booking request.
                        For inquiries, please contact our support
                        during office hours.
                    </p>

                    <div class="action-container">
                        <a href="https://agtabeachresort.com"
                           class="action-btn">
                            Visit Agta Beach Resort
                        </a>
                    </div>

                    <div class="contact-info">
                        📍 Biliran Province, Philippines
                    </div>

                </div>

                <div class="footer">
                    © ${currentYear} Agta Beach Resort.
                    All rights reserved.
                </div>

            </div>
        </body>
        </html>
        `;

        const mixedBoundary = `mixed_${Date.now()}`;
        const alternativeBoundary = `alt_${Date.now()}`;

        const messageParts = [
            `From: Agta Beach Resort <${process.env.EMAIL_USER}>`,
            `To: ${email}`,
            `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
            'MIME-Version: 1.0',
            `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
            '',
            `--${mixedBoundary}`,
            `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
            '',
            `--${alternativeBoundary}`,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            wrapBase64(Buffer.from(text).toString('base64')),
            '',
            `--${alternativeBoundary}`,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            wrapBase64(Buffer.from(html).toString('base64')),
            '',
            `--${alternativeBoundary}--`,
            ''
        ];

        // Attachments
        for (const file of options.attachments || []) {
            const attachment = await buildAttachment(
                file,
                mixedBoundary
            );

            if (attachment) {
                messageParts.push(attachment);
            }
        }

        messageParts.push(`--${mixedBoundary}--`);

        const rawMessage = encodeMessage(
            messageParts.join('\r\n')
        );

        // Send email using Gmail API
        const response = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: rawMessage
            }
        });

        console.log(
            'Email sent successfully:',
            response.data.id
        );

        return response.data;

    } catch (error) {
        console.error(
            'Gmail API Error:',
            error.response?.data || error.message
        );

        throw error;
    }
};

module.exports = sendEmail;
