import { sendEmail } from "@/lib/email";

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers.get("svix-signature") ?? req.headers.get("webhook-signature");
    if (!signature || signature !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const body = await req.json();
  if (body.type !== "email.received") {
    return new Response("OK", { status: 200 });
  }

  const { email_id, from, subject } = body.data;

  // Fetch full email body from Resend API
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return new Response("No API key", { status: 500 });

  const resendRes = await fetch(`https://api.resend.com/emails/receiving/${email_id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!resendRes.ok) {
    console.error("[email-received] Failed to fetch email body:", await resendRes.text());
    return new Response("Failed to fetch email", { status: 500 });
  }

  const email = await resendRes.json();
  const bodyHtml = email.html ?? `<pre>${email.text ?? "(no body)"}</pre>`;

  await sendEmail({
    to: "sampsongohengtze@gmail.com",
    subject: `[Support] ${subject ?? "(no subject)"}`,
    html: `
      <p><strong>From:</strong> ${from}</p>
      <p><strong>Subject:</strong> ${subject ?? "(no subject)"}</p>
      <hr />
      ${bodyHtml}
    `,
  });

  return new Response("OK", { status: 200 });
}
