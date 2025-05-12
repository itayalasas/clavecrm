
"use client";

import { useState } from "react";
import type { Meeting, Lead, User } from "@/lib/types";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MeetingListItem } from "./meeting-list-item"; 
import { format, isSameDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface CalendarViewProps {
  meetings: Meeting[];
  onEditMeeting: (meeting: Meeting) => void;
  leads: Lead[]; 
  users: User[];
}

export function CalendarView({ meetings, onEditMeeting, leads, users }: CalendarViewProps) {
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
            // TODO: Add modifiers for days with events using `modifiers` prop
            // Example: modifiers={{ highlighted: meetings.map(m => parseISO(m.startTime)) }}
            // modifiersClassNames={{ highlighted: 'bg-primary/20 rounded-full' }}
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
                  onDelete={() => { /* Implement delete or pass handler if needed here */ }} 
                  leads={leads} 
                  users={users} 
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
