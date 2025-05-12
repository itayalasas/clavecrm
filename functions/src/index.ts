
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { createEvents, EventAttributes } from 'ics';

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

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
  // Other fields...
}


// Nodemailer transporter configuration
let mailTransport: nodemailer.Transporter | null = null;
let defaultSenderEmail = "noreply@example.com";
let defaultSenderName = "MiniCRM Express";

async function getMailTransport() {
  if (mailTransport) {
    return mailTransport;
  }
  try {
    const settingsDoc = await db.collection("settings").doc("emailConfiguration").get();
    if (!settingsDoc.exists) {
      functions.logger.error("Configuración de correo electrónico no encontrada en Firestore.");
      throw new Error("Email settings not found.");
    }
    const settings = settingsDoc.data();
    if (!settings || !settings.smtpHost || !settings.smtpPort) {
      functions.logger.error("Configuración SMTP incompleta en Firestore.", settings);
      throw new Error("Incomplete SMTP settings.");
    }

    defaultSenderEmail = settings.defaultSenderEmail || "noreply@example.com";
    defaultSenderName = settings.defaultSenderName || "MiniCRM Express";

    mailTransport = nodemailer.createTransport({
      host: settings.smtpHost,
      port: parseInt(settings.smtpPort as string || "587"),
      secure: settings.smtpSecurity === "SSL" || settings.smtpSecurity === "TLS",
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPass,
      },
      ...(settings.smtpSecurity === "TLS" && {
          tls: {
              rejectUnauthorized: process.env.NODE_ENV === "production",
          },
      }),
    });
    functions.logger.info("Mail transporter configurado exitosamente desde Firestore.");
    return mailTransport;
  } catch (error) {
    functions.logger.error("Error al configurar el mail transporter desde Firestore:", error);
    mailTransport = null;
    throw error;
  }
}

function personalizeContent(content: string, contact: Contact, campaignFromName: string): string {
  let personalized = content;
  personalized = personalized.replace(/{{nombre_contacto}}/g, `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.email);
  personalized = personalized.replace(/{{email_contacto}}/g, contact.email);
  personalized = personalized.replace(/{{nombre_empresa_remitente}}/g, campaignFromName || defaultSenderName);
  return personalized;
}


export const sendEmailCampaign = functions.firestore
  .document("emailCampaigns/{campaignId}")
  .onUpdate(async (change, context) => {
    const campaignId = context.params.campaignId;
    const newData = change.after.data() as EmailCampaign;
    const oldData = change.before.data() as EmailCampaign;

    if (newData.status !== "Enviando") {
      functions.logger.info(`Campaign ${campaignId}: Status is not 'Enviando'. Current status: ${newData.status}. Skipping.`);
      return null;
    }
    if (oldData.status === "Enviando" && newData.updatedAt === oldData.updatedAt && (newData.analytics?.emailsSent || 0) > 0) {
        functions.logger.info(`Campaign ${campaignId}: Already processed or no relevant update. Skipping.`);
        return null;
    }

    functions.logger.info(`Campaign ${campaignId}: Processing campaign in 'Enviando' state.`);

    try {
      const transporter = await getMailTransport();
      const contactListDoc = await db.collection("contactLists").doc(newData.contactListId).get();
      if (!contactListDoc.exists) throw new Error(`Contact list ${newData.contactListId} not found.`);
      
      const contactsSnapshot = await db.collection("contacts").where("listIds", "array-contains", newData.contactListId).get();
      const contacts: Contact[] = contactsSnapshot.docs
        .map((doc) => ({id: doc.id, ...doc.data()} as Contact))
        .filter(contact => contact.subscribed !== false);

      const totalRecipients = contacts.length;
      await db.collection("emailCampaigns").doc(campaignId).set({
        analytics: { ...newData.analytics, totalRecipients: totalRecipients, emailsSent: 0 }
      }, { merge: true });

      if (totalRecipients === 0) {
        functions.logger.info(`Campaign ${campaignId}: No subscribed contacts. Marking as sent.`);
        await db.collection("emailCampaigns").doc(campaignId).update({
          status: "Enviada", sentAt: admin.firestore.FieldValue.serverTimestamp(),
          "analytics.totalRecipients": 0, "analytics.emailsSent": 0,
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
          to: contact.email, subject: newData.subject, html: personalizedHtml,
        };
        try {
          await transporter.sendMail(mailOptions);
          emailsSuccessfullySent++;
          functions.logger.info(`Campaign ${campaignId}: Email sent to ${contact.email}`);
        } catch (error) {
          functions.logger.error(`Campaign ${campaignId}: Failed to send to ${contact.email}`, error);
        }
      });
      await Promise.all(emailPromises);
      functions.logger.info(`Campaign ${campaignId}: Finished. ${emailsSuccessfullySent}/${totalRecipients} sent.`);
      const finalStatus = emailsSuccessfullySent > 0 || totalRecipients === 0 ? "Enviada" : "Fallida";
      await db.collection("emailCampaigns").doc(campaignId).update({
        status: finalStatus, sentAt: admin.firestore.FieldValue.serverTimestamp(),
        "analytics.emailsSent": emailsSuccessfullySent,
      });
      return null;
    } catch (error) {
      functions.logger.error(`Campaign ${campaignId}: Error processing campaign:`, error);
      try {
        await db.collection("emailCampaigns").doc(campaignId).update({
            status: "Fallida",
            "analytics.totalRecipients": newData.analytics?.totalRecipients || 0,
            "analytics.emailsSent": newData.analytics?.emailsSent || 0,
        });
      } catch (updateError) {
          functions.logger.error(`Campaign ${campaignId}: Error updating campaign to Fallida status:`, updateError);
      }
      return null;
    }
  });

export const sendMeetingInvitation = functions.firestore
  .document('meetings/{meetingId}')
  .onWrite(async (change, context) => {
    const meetingId = context.params.meetingId;
    const meetingData = change.after.exists ? change.after.data() as Meeting : null;
    const oldMeetingData = change.before.exists ? change.before.data() as Meeting : null;

    if (!meetingData) {
      functions.logger.info(`Meeting ${meetingId} deleted. No action taken.`);
      return null;
    }

    // Determine if invitations should be sent
    const isNewMeeting = !change.before.exists;
    const attendeesChanged = oldMeetingData ? JSON.stringify(oldMeetingData.attendees) !== JSON.stringify(meetingData.attendees) : false;
    const timeChanged = oldMeetingData ? (oldMeetingData.startTime !== meetingData.startTime || oldMeetingData.endTime !== meetingData.endTime) : false;
    const statusChanged = oldMeetingData ? oldMeetingData.status !== meetingData.status : false;
    
    // Send invitations for new meetings, or if attendees/time changed, or if status becomes 'Confirmada'
    // Avoid sending if status is 'Cancelada' or 'Realizada' unless it's a new cancellation.
    let shouldSend = isNewMeeting || attendeesChanged || timeChanged || (statusChanged && meetingData.status === 'Confirmada');
    
    if (meetingData.status === 'Cancelada' || meetingData.status === 'Realizada') {
        if (isNewMeeting || (statusChanged && oldMeetingData?.status !== meetingData.status)){
            // Send cancellation/update for these statuses if status *just* changed to this
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
      const transporter = await getMailTransport();
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
          rsvp: att.status === 'Aceptada',
          partstat: att.status.toUpperCase() as EventAttributes['attendees'] extends (infer U)[] | undefined ? U['partstat'] : never, // PENDING, ACCEPTED, DECLINED, TENTATIVE
          role: 'REQ-PARTICIPANT'
        }))
      };

      const { error: icsError, value: icsFileContent } = createEvents([event]);
      if (icsError || !icsFileContent) {
        functions.logger.error(`Error creating .ics file for meeting ${meetingId}:`, icsError);
        throw new Error("Could not generate .ics file.");
      }

      const emailPromises = meetingData.attendees.map(async (attendee) => {
        const subjectPrefix = meetingData.status === 'Cancelada' ? 'Cancelación: ' : (isNewMeeting ? 'Invitación: ' : 'Actualización: ');
        const mailOptions = {
          from: `"${organizerName}" <${organizerEmail}>`,
          to: attendee.email,
          subject: `${subjectPrefix}${meetingData.title}`,
          html: `
            <p>Hola ${attendee.name},</p>
            <p>Estás invitado/a a la reunión: <strong>${meetingData.title}</strong>.</p>
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
          functions.logger.info(`Meeting ${meetingId}: Invitation sent to ${attendee.email}`);
        } catch (sendError) {
          functions.logger.error(`Meeting ${meetingId}: Failed to send invitation to ${attendee.email}`, sendError);
        }
      });

      await Promise.all(emailPromises);
      functions.logger.info(`Meeting ${meetingId}: Finished sending invitations.`);
      // Optionally update a 'lastInvitationSentAt' field on the meeting document.

      return null;
    } catch (error) {
      functions.logger.error(`Meeting ${meetingId}: Error processing invitations:`, error);
      return null;
    }
  });
