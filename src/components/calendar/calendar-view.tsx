
"use client";

import { useState } from "react";
import type { Meeting } from "@/lib/types";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MeetingListItem } from "./meeting-list-item"; // Assuming this will be created
import { format, isSameDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface CalendarViewProps {
  meetings: Meeting[];
  onEditMeeting: (meeting: Meeting) => void;
  // onDeleteMeeting will be handled by MeetingListItem or a context menu later
}

export function CalendarView({ meetings, onEditMeeting }: CalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const meetingsForSelectedDay = meetings.filter(meeting => 
    selectedDate && isSameDay(parseISO(meeting.startTime), selectedDate)
  ).sort((a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
      <Card className="md:col-span-1 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Seleccionar Fecha</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            className="rounded-md"
            locale={es}
            // TODO: Add modifiers for days with events
          />
        </CardContent>
      </Card>

      <Card className="md:col-span-2 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">
            Reuniones para {selectedDate ? format(selectedDate, "PPP", { locale: es }) : "Hoy"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {meetingsForSelectedDay.length > 0 ? (
            <div className="space-y-3">
              {meetingsForSelectedDay.map(meeting => (
                <MeetingListItem
                  key={meeting.id}
                  meeting={meeting}
                  onEdit={onEditMeeting}
                  onDelete={() => { /* Implement delete or pass handler */ }} 
                  // Pass leads and users if MeetingListItem needs them, or handle data fetching inside it
                  leads={[]} // Placeholder
                  users={[]} // Placeholder
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              No hay reuniones programadas para esta fecha.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
