export type IntegrationConfig = {
  enabled: boolean;
  solutions: { id: string; checkId: string; url: string; reason: string }[];
};
export function integrationConfig(): IntegrationConfig {
  return {
    enabled: process.env.INFOHOLDER_ENABLED === "true",
    solutions: [
      {
        id: "booking",
        checkId: "next-step",
        url: "https://www.infoholder.io/app-studio/en/solutions/booking",
        reason:
          "If your business takes appointments, a dedicated booking page can provide a clear next step.",
      },
      {
        id: "event",
        checkId: "next-step",
        url: "https://www.infoholder.io/app-studio/en/solutions/event",
        reason:
          "If you run events or classes, a registration page can collect sign-ups.",
      },
    ],
  };
}
