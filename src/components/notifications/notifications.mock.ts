import { SEO_CONFIG } from "~/app";

import type { Notification } from "./notification-center";

export const mockNotifications: Notification[] = [
  {
    id: "1",
    type: "info" as const,
    title: `Welcome to ${SEO_CONFIG.name.en}!`,
    description: "Thank you for signing up. Let's get started!",
    timestamp: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
    read: false,
  },
  {
    id: "2",
    type: "success" as const,
    title: "Profile Updated",
    description: "Your profile has been successfully updated.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    read: true,
  },
  {
    id: "3",
    type: "warning" as const,
    title: "Payment Reminder",
    description: "Your subscription will expire in 3 days.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    read: false,
  },
  {
    id: "4",
    type: "error" as const,
    title: "Upload Failed",
    description: "Failed to upload image. Please try again.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
    read: true,
  },
];
