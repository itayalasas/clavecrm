
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";

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
  analytics: { // Using a simplified analytics structure here for the function
    totalRecipients: number;
    emailsSent: number;
    // Other fields like emailsDelivered, emailsOpened, etc., would be added later
    // via webhooks or tracking pixels, not directly by this sending function.
  };
}

interface Contact {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  subscribed?: boolean; // Add subscribed field
  // Add other relevant fields for personalization
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  contentHtml?: string;
}

// Nodemailer transporter configuration (loaded dynamically from Firestore settings)
let mailTransport: nodemailer.Transporter | null = null;
let defaultSenderEmail = "noreply@example.com";
let defaultSenderName = "Your Application";

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
    defaultSenderName = settings.defaultSenderName || "Your Application";

    mailTransport = nodemailer.createTransport({
      host: settings.smtpHost,
      port: parseInt(settings.smtpPort as string || "587"), // Ensure port is number
      secure: settings.smtpSecurity === "SSL" || settings.smtpSecurity === "TLS", // secure for SSL/TLS
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPass,
      },
      // Add TLS options if security is TLS and strictness is needed
      ...(settings.smtpSecurity === "TLS" && {
          tls: {
              // do not fail on invalid certs if using self-signed certificates in dev
              rejectUnauthorized: process.env.NODE_ENV === "production",
          },
      }),
    });
    functions.logger.info("Mail transporter configurado exitosamente desde Firestore.");
    return mailTransport;
  } catch (error) {
    functions.logger.error("Error al configurar el mail transporter desde Firestore:", error);
    mailTransport = null; // Reset so it tries again next time
    throw error; // Re-throw to fail the function if critical
  }
}


/**
 * Replaces placeholders in the email content with contact-specific data.
 * @param {string} content The HTML content of the email.
 * @param {Contact} contact The contact object.
 * @param {string} campaignFromName Name of the sender for this campaign.
 * @return {string} Personalized HTML content.
 */
function personalizeContent(content: string, contact: Contact, campaignFromName: string): string {
  let personalized = content;
  personalized = personalized.replace(/{{nombre_contacto}}/g, `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.email);
  personalized = personalized.replace(/{{email_contacto}}/g, contact.email);
  personalized = personalized.replace(/{{nombre_empresa_remitente}}/g, campaignFromName || defaultSenderName);
  // Add more placeholder replacements as needed
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
     // Prevent re-processing if status was already 'Enviando' and no relevant data changed
    if (oldData.status === "Enviando" && newData.updatedAt === oldData.updatedAt && newData.analytics.emailsSent > 0) {
        functions.logger.info(`Campaign ${campaignId}: Already processed or no relevant update. Skipping.`);
        return null;
    }


    functions.logger.info(`Campaign ${campaignId}: Processing campaign in 'Enviando' state.`);

    try {
      const transporter = await getMailTransport(); // Ensure transporter is ready

      const contactListDoc = await db.collection("contactLists").doc(newData.contactListId).get();
      if (!contactListDoc.exists) {
        throw new Error(`Contact list ${newData.contactListId} not found.`);
      }
      
      const contactsSnapshot = await db.collection("contacts").where("listIds", "array-contains", newData.contactListId).get();
      const contacts: Contact[] = contactsSnapshot.docs
        .map((doc) => ({id: doc.id, ...doc.data()} as Contact))
        .filter(contact => contact.subscribed !== false); // Filter out unsubscribed contacts

      const totalRecipients = contacts.length;
      await db.collection("emailCampaigns").doc(campaignId).set({
        analytics: {
          ...newData.analytics, // Preserve existing analytics
          totalRecipients: totalRecipients,
          emailsSent: 0, // Initialize emailsSent for this run
        }
      }, { merge: true });


      if (contacts.length === 0) {
        functions.logger.info(`Campaign ${campaignId}: No subscribed contacts found in list ${newData.contactListId}. Marking as sent (0 recipients).`);
        await db.collection("emailCampaigns").doc(campaignId).update({
          status: "Enviada",
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          "analytics.totalRecipients": 0,
          "analytics.emailsSent": 0,
        });
        return null;
      }

      const templateDoc = await db.collection("emailTemplates").doc(newData.emailTemplateId).get();
      if (!templateDoc.exists) {
        throw new Error(`Email template ${newData.emailTemplateId} not found.`);
      }
      const template = templateDoc.data() as EmailTemplate;

      let emailsSuccessfullySent = 0;
      const emailPromises = contacts.map(async (contact) => {
        if (!contact.email) { // basic validation
          functions.logger.warn(`Campaign ${campaignId}: Skipping contact ${contact.id} due to missing email.`);
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
          functions.logger.error(`Campaign ${campaignId}: Failed to send email to ${contact.email}`, error);
        }
      });

      await Promise.all(emailPromises);

      functions.logger.info(`Campaign ${campaignId}: Finished sending. ${emailsSuccessfullySent}/${totalRecipients} emails sent.`);

      const finalStatus = emailsSuccessfullySent > 0 || totalRecipients === 0 ? "Enviada" : "Fallida";
      await db.collection("emailCampaigns").doc(campaignId).update({
        status: finalStatus,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        "analytics.emailsSent": emailsSuccessfullySent,
        // More detailed analytics (delivered, opened, clicked) would require webhooks or tracking pixels
      });

      return null;
    } catch (error) {
      functions.logger.error(`Campaign ${campaignId}: Error processing campaign:`, error);
      try {
        await db.collection("emailCampaigns").doc(campaignId).update({
            status: "Fallida",
            "analytics.totalRecipients": newData.analytics?.totalRecipients || 0, // Preserve if already set
            "analytics.emailsSent": newData.analytics?.emailsSent || 0, // Preserve if some were sent before error
        });
      } catch (updateError) {
          functions.logger.error(`Campaign ${campaignId}: Error updating campaign to Fallida status:`, updateError);
      }
      return null;
    }
  });
