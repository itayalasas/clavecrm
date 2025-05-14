
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { createEvents, type EventAttributes } from 'ics'; // Keep type for EventAttributes
import { format, differenceInHours, isAfter, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
// import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'; // Not strictly needed for this logic yet, but good to have if timezone handling becomes complex

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

// --- Interfaces (align with src/lib/types.ts or define locally as needed) ---
interface User {
  id: string;
  name: string;
  email: string;
  role: string; // Simplified for CF context
}

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string; // 'Abierto', 'En Progreso', 'Resuelto', 'Cerrado'
  priority: string; // 'Alta', 'Media', 'Baja'
  createdAt: admin.firestore.Timestamp; // Expect Timestamp from Firestore
  updatedAt?: admin.firestore.Timestamp;
  reporterUserId: string;
  assigneeUserId?: string;
  slaId?: string;
  queueId?: string;
  appliedEscalationRuleIds?: string[]; // To track applied rules
  firstResponseAt?: admin.firestore.Timestamp;
  // ... other ticket fields
}

interface EscalationRule {
  id: string;
  name: string;
  isEnabled: boolean;
  order: number;
  conditionType: string; // 'sla_response_breached', 'ticket_idle_for_x_hours', etc.
  conditionValue?: string | number;
  actionType: string; // 'notify_user', 'change_priority', etc.
  actionTargetUserId?: string;
  actionTargetPriority?: string;
  actionTargetQueueId?: string;
  // ... other rule fields
}

interface SLA {
    id: string;
    name: string;
    responseTimeTargetMinutes: number;
    resolutionTimeTargetHours: number;
    businessHoursOnly: boolean; // We'll note this but not implement complex business hour logic here
}


// --- Existing Email Campaign and Meeting Invitation Code (keep as is) ---
interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  contactListId: string;
  emailTemplateId: string;
  status: string; // 'Borrador', 'Programada', 'Enviando', 'Enviada', 'Fallida'
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
  updatedAt?: string;
  analytics: {
    totalRecipients: number;
    emailsSent: number;
  };
}

interface Contact {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  subscribed?: boolean;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  contentHtml?: string;
}

interface MeetingAttendee {
  id: string;
  type: 'user' | 'contact' | 'external';
  name: string;
  email: string;
  status: 'Aceptada' | 'Rechazada' | 'Pendiente' | 'Tentativa';
}

interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  attendees: MeetingAttendee[];
  location?: string;
  conferenceLink?: string;
  createdByUserId: string;
  status: 'Programada' | 'Confirmada' | 'Cancelada' | 'Realizada' | 'Pospuesta';
}


let mailTransport: nodemailer.Transporter | null = null;
let defaultSenderEmail = "noreply@example.com";
let defaultSenderName = "MiniCRM Express";

async function getMailTransport(forceRefresh: boolean = false) {
  if (mailTransport && !forceRefresh) {
    return mailTransport;
  }
  try {
    const settingsDoc = await db.collection("settings").doc("emailConfiguration").get();
    if (!settingsDoc.exists) {
      functions.logger.error("Configuración de correo electrónico no encontrada en Firestore.");
      throw new Error("Email settings not found.");
    }
    const settings = settingsDoc.data();
    if (!settings || !settings.smtpHost || !settings.smtpPort || !settings.smtpUser || !settings.smtpPass) {
      functions.logger.error("Configuración SMTP incompleta en Firestore.", settings);
      throw new Error("Incomplete SMTP settings.");
    }

    defaultSenderEmail = settings.defaultSenderEmail || "noreply@example.com";
    defaultSenderName = settings.defaultSenderName || "MiniCRM Express";

    mailTransport = nodemailer.createTransport({
      host: settings.smtpHost,
      port: parseInt(settings.smtpPort as string || "587"),
      secure: settings.smtpSecurity === "SSL" || settings.smtpSecurity === "TLS", // true for 465, false for other ports
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPass,
      },
      ...(settings.smtpSecurity === "TLS" && {
          tls: {
              rejectUnauthorized: process.env.NODE_ENV === "production", // Stricter in production
          },
      }),
    });
    functions.logger.info("Mail transporter configurado exitosamente desde Firestore.");
    return mailTransport;
  } catch (error) {
    functions.logger.error("Error al configurar el mail transporter desde Firestore:", error);
    mailTransport = null; // Reset on error to allow re-attempt
    throw error;
  }
}

function personalizeContent(content: string, contact: Contact, campaignFromName: string): string {
  let personalized = content;
  personalized = personalized.replace(/{{nombre_contacto}}/g, `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.email);
  personalized = personalized.replace(/{{email_contacto}}/g, contact.email);
  personalized = personalized.replace(/{{nombre_empresa_remitente}}/g, campaignFromName || defaultSenderName);
  // Add more variable replacements here if needed
  return personalized;
}

export const sendEmailCampaign = functions.region('southamerica-west1').firestore // Specify region if needed
  .document("emailCampaigns/{campaignId}")
  .onUpdate(async (change, context) => {
    const campaignId = context.params.campaignId;
    const newData = change.after.data() as EmailCampaign;
    const oldData = change.before.data() as EmailCampaign;

    if (newData.status !== "Enviando") {
      functions.logger.info(`Campaign ${campaignId}: Status is not 'Enviando'. Current status: ${newData.status}. Skipping.`);
      return null;
    }
    // Prevent re-processing if already sent or if no critical fields changed
    if (oldData.status === "Enviando" && newData.updatedAt === oldData.updatedAt && (newData.analytics?.emailsSent || 0) > 0) {
        functions.logger.info(`Campaign ${campaignId}: Already processed or no relevant update. Skipping.`);
        return null;
    }

    functions.logger.info(`Campaign ${campaignId}: Processing campaign in 'Enviando' state.`);

    try {
      const transporter = await getMailTransport(true); // Force refresh config
      const contactListDoc = await db.collection("contactLists").doc(newData.contactListId).get();
      if (!contactListDoc.exists) throw new Error(`Contact list ${newData.contactListId} not found.`);
      
      const contactsSnapshot = await db.collection("contacts").where("listIds", "array-contains", newData.contactListId).get();
      const contacts: Contact[] = contactsSnapshot.docs
        .map((doc) => ({id: doc.id, ...doc.data()} as Contact))
        .filter(contact => contact.subscribed !== false); // Only send to subscribed contacts

      const totalRecipients = contacts.length;
      // Initialize analytics if they don't exist or reset if needed
      await db.collection("emailCampaigns").doc(campaignId).set({
        analytics: { ...newData.analytics, totalRecipients: totalRecipients, emailsSent: 0 }
      }, { merge: true });


      if (totalRecipients === 0) {
        functions.logger.info(`Campaign ${campaignId}: No subscribed contacts. Marking as sent.`);
        await db.collection("emailCampaigns").doc(campaignId).update({
          status: "Enviada", // Or maybe "Fallida" if no recipients is an error
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          "analytics.totalRecipients": 0,
          "analytics.emailsSent": 0,
        });
        return null;
      }

      const templateDoc = await db.collection("emailTemplates").doc(newData.emailTemplateId).get();
      if (!templateDoc.exists) throw new Error(`Email template ${newData.emailTemplateId} not found.`);
      const template = templateDoc.data() as EmailTemplate;

      let emailsSuccessfullySent = 0;
      const emailPromises = contacts.map(async (contact) => {
        if (!contact.email) {
          functions.logger.warn(`Campaign ${campaignId}: Skipping contact ${contact.id} (missing email).`);
          return;
        }
        const personalizedHtml = personalizeContent(template.contentHtml || "", contact, newData.fromName);
        const mailOptions = {
          from: `"${newData.fromName || defaultSenderName}" <${newData.fromEmail || defaultSenderEmail}>`,
          to: contact.email,
          subject: newData.subject,
          html: personalizedHtml,
        };
        try {
          await transporter.sendMail(mailOptions);
          emailsSuccessfullySent++;
          functions.logger.info(`Campaign ${campaignId}: Email sent to ${contact.email}`);
        } catch (error) {
          functions.logger.error(`Campaign ${campaignId}: Failed to send to ${contact.email}`, error);
          // Optionally log individual failures to Firestore for tracking
        }
      });

      await Promise.all(emailPromises);

      functions.logger.info(`Campaign ${campaignId}: Finished sending. ${emailsSuccessfullySent}/${totalRecipients} emails sent successfully.`);
      const finalStatus = emailsSuccessfullySent > 0 || totalRecipients === 0 ? "Enviada" : "Fallida";
      await db.collection("emailCampaigns").doc(campaignId).update({
        status: finalStatus,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        "analytics.emailsSent": emailsSuccessfullySent,
      });

      return null;
    } catch (error) {
      functions.logger.error(`Campaign ${campaignId}: Error processing campaign:`, error);
      try {
        await db.collection("emailCampaigns").doc(campaignId).update({
            status: "Fallida", // Mark as failed
            // Keep existing analytics or reset if appropriate
            "analytics.totalRecipients": newData.analytics?.totalRecipients || 0,
            "analytics.emailsSent": newData.analytics?.emailsSent || 0, // Could be partial if some sent before error
        });
      } catch (updateError) {
          functions.logger.error(`Campaign ${campaignId}: Error updating campaign to Fallida status:`, updateError);
      }
      return null;
    }
  });

export const sendMeetingInvitation = functions.region('southamerica-west1').firestore
  .document('meetings/{meetingId}')
  .onWrite(async (change, context) => { // Using onWrite to catch creates and updates
    const meetingId = context.params.meetingId;
    const meetingData = change.after.exists ? change.after.data() as Meeting : null;
    const oldMeetingData = change.before.exists ? change.before.data() as Meeting : null;

    if (!meetingData) {
      functions.logger.info(`Meeting ${meetingId} deleted. No action taken.`);
      return null;
    }

    // Determine if invitations should be sent
    const isNewMeeting = !change.before.exists;
    // More robust check for attendee changes
    const attendeesChanged = oldMeetingData ? JSON.stringify(oldMeetingData.attendees.map(a => ({email:a.email, status:a.status})).sort()) !== JSON.stringify(meetingData.attendees.map(a => ({email:a.email, status:a.status})).sort()) : false;
    const timeChanged = oldMeetingData ? (oldMeetingData.startTime !== meetingData.startTime || oldMeetingData.endTime !== meetingData.endTime) : false;
    const statusChanged = oldMeetingData ? oldMeetingData.status !== meetingData.status : false;
    
    let shouldSend = isNewMeeting || attendeesChanged || timeChanged || (statusChanged && meetingData.status === 'Confirmada');
    
    if (meetingData.status === 'Cancelada' || meetingData.status === 'Realizada') {
        if (isNewMeeting || (statusChanged && oldMeetingData?.status !== meetingData.status)){
            functions.logger.info(`Meeting ${meetingId} status is ${meetingData.status}. Sending update/cancellation.`);
        } else {
             functions.logger.info(`Meeting ${meetingId} status is ${meetingData.status}. No critical changes for resend.`);
             shouldSend = false;
        }
    }
    
    if (!shouldSend) {
      functions.logger.info(`Meeting ${meetingId}: No conditions met for sending/resending invitations. Skipping.`);
      return null;
    }

    functions.logger.info(`Processing meeting ${meetingId} for invitations. Status: ${meetingData.status}`);

    try {
      const transporter = await getMailTransport(true); // Force refresh email config
      // Fetch creator user data (if needed for organizer info)
      const creatorUserDoc = await db.collection('users').doc(meetingData.createdByUserId).get();
      const creatorUser = creatorUserDoc.exists ? creatorUserDoc.data() as {name: string, email: string} : null;

      const organizerName = creatorUser?.name || defaultSenderName;
      const organizerEmail = creatorUser?.email || defaultSenderEmail;

      // Prepare .ics event data
      const start = new Date(meetingData.startTime);
      const end = new Date(meetingData.endTime);
      const durationMillis = end.getTime() - start.getTime();
      const durationHours = Math.floor(durationMillis / (1000 * 60 * 60));
      const durationMinutes = Math.floor((durationMillis % (1000 * 60 * 60)) / (1000 * 60));

      const event: EventAttributes = {
        start: [start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), start.getUTCHours(), start.getUTCMinutes()],
        duration: { hours: durationHours, minutes: durationMinutes },
        title: meetingData.title,
        description: meetingData.description || '',
        location: meetingData.location || '',
        url: meetingData.conferenceLink || '',
        status: meetingData.status === 'Cancelada' ? 'CANCELLED' : (meetingData.status === 'Confirmada' || meetingData.status === 'Realizada' ? 'CONFIRMED' : 'TENTATIVE'),
        organizer: { name: organizerName, email: organizerEmail },
        attendees: meetingData.attendees.map(att => ({
          name: att.name,
          email: att.email,
          rsvp: att.status === 'Aceptada', // Outlook uses this
          partstat: att.status === 'Aceptada' ? 'ACCEPTED' : att.status === 'Rechazada' ? 'DECLINED' : att.status === 'Tentativa' ? 'TENTATIVE' : 'NEEDS-ACTION', // Standard partstat values
          role: 'REQ-PARTICIPANT'
        }))
      };

      const { error: icsError, value: icsFileContent } = createEvents([event]);
      if (icsError || !icsFileContent) {
        functions.logger.error(`Error creating .ics file for meeting ${meetingId}:`, icsError);
        throw new Error("Could not generate .ics file.");
      }

      const emailPromises = meetingData.attendees.map(async (attendee) => {
        // Check if this specific attendee needs an update (new or status changed)
        const oldAttendeeData = oldMeetingData?.attendees.find(a => a.email === attendee.email);
        const attendeeStatusChanged = oldAttendeeData ? oldAttendeeData.status !== attendee.status : false;
        
        // Send only if new attendee, or if meeting details changed, or if their status changed
        if (isNewMeeting || timeChanged || statusChanged || !oldAttendeeData || attendeeStatusChanged) {
            const subjectPrefix = meetingData.status === 'Cancelada' ? 'Cancelación: ' : (isNewMeeting || !oldMeetingData ? 'Invitación: ' : 'Actualización: ');
            const mailOptions: nodemailer.SendMailOptions = {
            from: `"${organizerName}" <${organizerEmail}>`,
            to: attendee.email,
            subject: `${subjectPrefix}${meetingData.title}`,
            html: `
                <p>Hola ${attendee.name},</p>
                <p>Estás ${meetingData.status === 'Cancelada' ? 'notificado/a de la cancelación de' : 'invitado/a a'} la reunión: <strong>${meetingData.title}</strong>.</p>
                ${meetingData.description ? `<p>Detalles: ${meetingData.description}</p>` : ''}
                <p><strong>Cuándo:</strong> ${start.toLocaleString('es-ES', { timeZone: 'UTC' })} - ${end.toLocaleString('es-ES', { timeZone: 'UTC' })} (UTC)</p>
                ${meetingData.location ? `<p><strong>Dónde:</strong> ${meetingData.location}</p>` : ''}
                ${meetingData.conferenceLink ? `<p><strong>Enlace:</strong> <a href="${meetingData.conferenceLink}">${meetingData.conferenceLink}</a></p>` : ''}
                <p>Por favor, añade este evento a tu calendario.</p>
                <p>Saludos,<br/>${organizerName}</p>
            `,
            icalEvent: {
                filename: 'invite.ics',
                method: meetingData.status === 'Cancelada' ? 'CANCEL' : 'REQUEST',
                content: icsFileContent
            }
            };

            try {
            await transporter.sendMail(mailOptions);
            functions.logger.info(`Meeting ${meetingId}: Invitation/Update sent to ${attendee.email}`);
            } catch (sendError) {
            functions.logger.error(`Meeting ${meetingId}: Failed to send invitation/update to ${attendee.email}`, sendError);
            }
        } else {
             functions.logger.info(`Meeting ${meetingId}: No change requiring re-invite for attendee ${attendee.email}`);
        }
      });

      await Promise.all(emailPromises);
      functions.logger.info(`Meeting ${meetingId}: Finished sending invitations/updates.`);
      
      // Optionally update a 'lastInvitationSentAt' field on the meeting document.
      // await db.collection("meetings").doc(meetingId).update({ lastInvitationSentAt: admin.firestore.FieldValue.serverTimestamp() });

      return null;
    } catch (error) {
      functions.logger.error(`Meeting ${meetingId}: Error processing invitations:`, error);
      return null;
    }
  });

// --- New Escalation Rule Functions ---

/**
 * Helper function to send a notification email.
 */
async function sendNotificationEmail(recipientEmail: string, subject: string, htmlBody: string) {
  if (!recipientEmail) {
    functions.logger.warn("No recipient email provided for notification.");
    return;
  }
  try {
    const transporter = await getMailTransport();
    const mailOptions = {
      from: `"${defaultSenderName} - Alertas CRM" <${defaultSenderEmail}>`,
      to: recipientEmail,
      subject: subject,
      html: htmlBody,
    };
    await transporter.sendMail(mailOptions);
    functions.logger.info(`Notification email sent to ${recipientEmail} with subject: ${subject}`);
  } catch (error) {
    functions.logger.error(`Failed to send notification email to ${recipientEmail}:`, error);
  }
}

/**
 * Helper function to log an escalation event to Firestore.
 */
async function logEscalationEvent(
  ticketId: string,
  ruleId: string,
  ruleName: string,
  conditionMet: string,
  actionTaken: string,
  details?: string
) {
  try {
    await db.collection("escalationLogs").add({
      ticketId,
      ruleId,
      ruleName,
      conditionMet,
      actionTaken,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: details || "",
    });
    functions.logger.info(`Escalation logged for ticket ${ticketId}, rule ${ruleName}.`);
  } catch (error) {
    functions.logger.error("Error logging escalation event:", error);
  }
}

/**
 * Scheduled Cloud Function to evaluate escalation rules.
 * Runs every 10 minutes (adjust as needed).
 */
export const evaluateEscalationRules = functions.region('southamerica-west1')
  .pubsub.schedule("every 10 minutes")
  .onRun(async (context) => {
    functions.logger.info("Starting escalation rule evaluation...");

    try {
      // 1. Fetch active escalation rules, ordered by 'order'
      const rulesSnapshot = await db.collection("escalationRules")
        .where("isEnabled", "==", true)
        .orderBy("order", "asc")
        .get();
      
      if (rulesSnapshot.empty) {
        functions.logger.info("No active escalation rules found.");
        return null;
      }
      const rules = rulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EscalationRule));

      // 2. Fetch active tickets (e.g., 'Abierto', 'En Progreso')
      const activeTicketStatuses = ["Abierto", "En Progreso"]; // Define which statuses are considered active
      const ticketsSnapshot = await db.collection("tickets")
        .where("status", "in", activeTicketStatuses)
        .get();

      if (ticketsSnapshot.empty) {
        functions.logger.info("No active tickets found to evaluate.");
        return null;
      }
      const tickets = ticketsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket));
      
      const now = new Date();

      // 3. Evaluate rules for each ticket
      for (const ticket of tickets) {
        functions.logger.info(`Evaluating ticket ${ticket.id} (${ticket.title})`);
        const ticketRef = db.collection("tickets").doc(ticket.id);
        let ticketSLA: SLA | null = null;
        if (ticket.slaId) {
            const slaDoc = await db.collection("slas").doc(ticket.slaId).get();
            if (slaDoc.exists) ticketSLA = slaDoc.data() as SLA;
        }

        for (const rule of rules) {
          // Skip if this rule has already been applied to this ticket for this "breach instance"
          // This simple check might need more sophisticated logic to allow re-application after resolution, etc.
          if (ticket.appliedEscalationRuleIds?.includes(rule.id)) {
            // functions.logger.info(`Rule ${rule.name} already applied to ticket ${ticket.id}. Skipping.`);
            continue;
          }

          let conditionMet = false;
          let conditionDescription = "";

          // --- Evaluate Conditions ---
          switch (rule.conditionType) {
            case "sla_response_breached":
              if (ticketSLA && ticket.status === "Abierto" && !ticket.firstResponseAt) {
                  const createdAtDate = ticket.createdAt.toDate(); // Convert Firestore Timestamp
                  const expectedResponseTime = new Date(createdAtDate.getTime() + ticketSLA.responseTimeTargetMinutes * 60000);
                  // TODO: Implement businessHoursOnly logic if sla.businessHoursOnly is true
                  if (isAfter(now, expectedResponseTime)) {
                      conditionMet = true;
                      conditionDescription = `SLA de respuesta (${ticketSLA.responseTimeTargetMinutes} min) incumplido.`;
                  }
              }
              break;
            case "sla_resolution_breached":
              if (ticketSLA && ticket.status !== "Resuelto" && ticket.status !== "Cerrado") {
                  const createdAtDate = ticket.createdAt.toDate();
                  const expectedResolutionTime = new Date(createdAtDate.getTime() + ticketSLA.resolutionTimeTargetHours * 60 * 60000);
                  // TODO: Implement businessHoursOnly logic
                  if (isAfter(now, expectedResolutionTime)) {
                      conditionMet = true;
                      conditionDescription = `SLA de resolución (${ticketSLA.resolutionTimeTargetHours} hrs) incumplido.`;
                  }
              }
              break;
            case "ticket_idle_for_x_hours":
              const idleHours = typeof rule.conditionValue === 'number' ? rule.conditionValue : parseInt(String(rule.conditionValue), 10);
              if (!isNaN(idleHours) && ticket.updatedAt) {
                const updatedAtDate = ticket.updatedAt.toDate(); // Convert Firestore Timestamp
                if (differenceInHours(now, updatedAtDate) > idleHours) {
                  conditionMet = true;
                  conditionDescription = `Ticket inactivo por más de ${idleHours} horas.`;
                }
              } else if (!isNaN(idleHours) && !ticket.updatedAt) { // If no updatedAt, use createdAt
                 const createdAtDate = ticket.createdAt.toDate();
                 if (differenceInHours(now, createdAtDate) > idleHours) {
                  conditionMet = true;
                  conditionDescription = `Ticket inactivo (basado en creación) por más de ${idleHours} horas.`;
                }
              }
              break;
            case "ticket_priority_is":
              if (ticket.priority === rule.conditionValue) {
                conditionMet = true;
                conditionDescription = `Prioridad del ticket es '${rule.conditionValue}'.`;
              }
              break;
            case "ticket_in_queue":
              if (ticket.queueId === rule.conditionValue) {
                conditionMet = true;
                conditionDescription = `Ticket está en la cola ID '${rule.conditionValue}'.`;
              }
              break;
            // Add more conditions here (ticket_sentiment_is_negative, customer_response_pending_for_x_hours)
            // These would require more complex logic, possibly external API calls for sentiment.
          }

          if (conditionMet) {
            functions.logger.info(`Rule '${rule.name}' condition met for ticket ${ticket.id}: ${conditionDescription}`);
            let actionDescription = "";
            const updateData: Partial<Ticket> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp};
            
            // --- Execute Actions ---
            switch (rule.actionType) {
              case "notify_user":
                if (rule.actionTargetUserId) {
                  const userDoc = await db.collection("users").doc(rule.actionTargetUserId).get();
                  if (userDoc.exists) {
                    const userToNotify = userDoc.data() as User;
                    const subject = `Alerta de Escalado CRM: Ticket #${ticket.id} - ${ticket.title}`;
                    const body = `
                      <p>Hola ${userToNotify.name},</p>
                      <p>El ticket <strong>#${ticket.id} (${ticket.title})</strong> ha sido escalado debido a la regla: "${rule.name}".</p>
                      <p>Condición cumplida: ${conditionDescription}</p>
                      <p>Por favor, revisa el ticket en el CRM.</p>
                      <p>Gracias,<br/>Sistema CRM Rápido</p>
                    `;
                    await sendNotificationEmail(userToNotify.email, subject, body);
                    actionDescription = `Notificado al usuario: ${userToNotify.name} (${userToNotify.email})`;
                  } else {
                     actionDescription = `Usuario objetivo ${rule.actionTargetUserId} para notificación no encontrado.`;
                     functions.logger.warn(actionDescription);
                  }
                }
                break;
              case "change_priority":
                if (rule.actionTargetPriority) {
                  updateData.priority = rule.actionTargetPriority;
                  actionDescription = `Prioridad cambiada a: ${rule.actionTargetPriority}`;
                }
                break;
              case "assign_to_user":
                if (rule.actionTargetUserId) {
                  updateData.assigneeUserId = rule.actionTargetUserId;
                  const userDoc = await db.collection("users").doc(rule.actionTargetUserId).get();
                  const userName = userDoc.exists ? (userDoc.data() as User).name : rule.actionTargetUserId;
                  actionDescription = `Asignado al usuario: ${userName}`;
                }
                break;
               case "assign_to_queue":
                if (rule.actionTargetQueueId) {
                  updateData.queueId = rule.actionTargetQueueId;
                  // You might want to fetch queue name for a better log description
                  actionDescription = `Movido a la cola ID: ${rule.actionTargetQueueId}`;
                }
                break;
              // Add more actions here (notify_group, trigger_webhook, create_follow_up_task)
            }
            
            // Mark rule as applied for this ticket to avoid re-triggering immediately
            updateData.appliedEscalationRuleIds = admin.firestore.FieldValue.arrayUnion(rule.id) as any;

            if (Object.keys(updateData).length > 1) { // Ensure there's more than just the timestamp update
                await ticketRef.update(updateData);
                functions.logger.info(`Ticket ${ticket.id} actualizado por regla ${rule.name}. Acción: ${actionDescription}`);
            } else {
                 functions.logger.info(`Solo se ejecutó una notificación para la regla ${rule.name} en el ticket ${ticket.id}, no se requieren cambios en el ticket más allá de marcar la regla como aplicada.`);
                 await ticketRef.update({ appliedEscalationRuleIds: admin.firestore.FieldValue.arrayUnion(rule.id) });
            }


            await logEscalationEvent(ticket.id, rule.id, rule.name, conditionDescription, actionDescription);
            
            break; // Stop processing more rules for this ticket in this run if one rule matched and acted.
                   // Or remove 'break' if multiple rules can apply simultaneously.
          }
        }
      }
      functions.logger.info("Escalation rule evaluation finished.");
      return null;
    } catch (error) {
      functions.logger.error("Error evaluating escalation rules:", error);
      return null;
    }
  });
