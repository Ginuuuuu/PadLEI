import type { LoginRequest } from "@/types/models";

const adminWhatsAppNumber = "918807905821";
const adminEmail = "reshin0026@gmail.com";

type NotificationRequest = Pick<LoginRequest, "requestId" | "fullName" | "email" | "contactMethod">;

export function buildAccessRequestMessage(request: NotificationRequest) {
  return [
    "Hello Admin, I am requesting access to PadLEI.",
    "",
    `Student name: ${request.fullName}`,
    `Student email: ${request.email}`,
    `Request ID: ${request.requestId}`
  ].join("\n");
}

export function buildAccessRequestNotificationUrl(request: NotificationRequest) {
  const message = buildAccessRequestMessage(request);
  if (request.contactMethod === "whatsapp") {
    return `https://wa.me/${adminWhatsAppNumber}?text=${encodeURIComponent(message)}`;
  }

  const subject = `PadLEI access request ${request.requestId}`;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(adminEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}
