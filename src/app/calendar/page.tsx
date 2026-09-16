import { AppShell } from "@/components/app-shell";
import { CalendarShell } from "@/components/calendar/calendar-shell";

export default function CalendarPage() {
  return (
    <AppShell>
      <CalendarShell />
    </AppShell>
  );
}