
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
  analytics?: EmailCampaignAnalytics;
}

interface EmailCampaignAnalytics {
  totalRecipients?: number;
  emailsSent?: number;
  emailsDelivered?: number; // Requires webhook or feedback loop from SMTP provider
  emailsOpened?: number;
  uniqueOpens?: number;
  emailsClicked?: number;
  uniqueClicks?: number;
  bounceCount?: number;
  unsubscribeCount?: number;
  spamReports?: number;
  deliveryRate?: number;
  openRate?: number;
  clickThroughRate?: number;
  clickToOpenRate?: number;
  unsubscribeRate?: number;
  bounceRate?: number;
}

interface Contact {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  // Add other relevant fields for personalization
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  contentHtml?: string;
}

// Nodemailer transporter configuration
// SMTP credentials should be set as Firebase environment variables
// e.g., firebase functions:config:set smtp.host="your.smtp.host" smtp.user="..." etc.
const mailTransport = nodemailer.createTransport({
  host: functions.config().smtp.host,
  port: parseInt(functions.config().smtp.port || "587"),
  secure: functions.config().smtp.secure === "true", // true for 465, false for other ports
  auth: {
    user: functions.config().smtp.user,
    pass: functions.config().smtp.pass,
  },
});

const DEFAULT_SENDER_EMAIL = functions.config().email.default_sender_email || "noreply@example.com";
const DEFAULT_SENDER_NAME = functions.config().email.default_sender_name || "Your Application";


/**
 * Replaces placeholders in the email content with contact-specific data.
 * @param {string} content The HTML content of the email.
 * @param {Contact} contact The contact object.
 * @return {string} Personalized HTML content.
 */
function personalizeContent(content: string, contact: Contact): string {
  let personalized = content;
  personalized = personalized.replace(/{{nombre_contacto}}/g, `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.email);
  personalized = personalized.replace(/{{email_contacto}}/g, contact.email);
  // Add more placeholder replacements as needed
  // personalized = personalized.replace(/{{nombre_empresa_remitente}}/g, DEFAULT_SENDER_NAME);
  return personalized;
}


export const sendEmailCampaign = functions.firestore
  .document("emailCampaigns/{campaignId}")
  .onUpdate(async (change, context) => {
    const campaignId = context.params.campaignId;
    const newData = change.after.data() as EmailCampaign;
    const oldData = change.before.data() as EmailCampaign;

    // Only proceed if status changed to 'Enviando' or was 'Enviando' already (e.g. retry)
    // or if it's a new campaign set directly to 'Enviando'
    if (newData.status !== "Enviando" || (oldData.status === "Enviando" && newData.updatedAt === oldData.updatedAt)) {
      functions.logger.info(`Campaign ${campaignId}: Status is not 'Enviando' or no relevant update. Current status: ${newData.status}. Skipping.`);
      return null;
    }

    functions.logger.info(`Campaign ${campaignId}: Processing campaign in 'Enviando' state.`);

    try {
      // Fetch Contact List
      const contactListDoc = await db.collection("contactLists").doc(newData.contactListId).get();
      if (!contactListDoc.exists) {
        throw new Error(`Contact list ${newData.contactListId} not found.`);
      }
      // Fetch Contacts from that list
      const contactsSnapshot = await db.collection("contacts").where("listIds", "array-contains", newData.contactListId).get();
      const contacts: Contact[] = contactsSnapshot.docs.map((doc) => ({id: doc.id, ...doc.data()} as Contact));

      if (contacts.length === 0) {
        functions.logger.info(`Campaign ${campaignId}: No contacts found in list ${newData.contactListId}. Marking as sent (0 recipients).`);
        await db.collection("emailCampaigns").doc(campaignId).update({
          status: "Enviada",
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          "analytics.totalRecipients": 0,
          "analytics.emailsSent": 0,
        });
        return null;
      }

      // Fetch Email Template
      const templateDoc = await db.collection("emailTemplates").doc(newData.emailTemplateId).get();
      if (!templateDoc.exists) {
        throw new Error(`Email template ${newData.emailTemplateId} not found.`);
      }
      const template = templateDoc.data() as EmailTemplate;

      let emailsSuccessfullySent = 0;
      const emailPromises = contacts.map(async (contact) => {
        if (!contact.email || !contact.subscribed) {
          functions.logger.info(`Campaign ${campaignId}: Skipping contact ${contact.id} (no email or unsubscribed).`);
          return;
        }

        const personalizedHtml = personalizeContent(template.contentHtml || "", contact);
        const mailOptions = {
          from: `"${newData.fromName || DEFAULT_SENDER_NAME}" <${newData.fromEmail || DEFAULT_SENDER_EMAIL}>`,
          to: contact.email,
          subject: newData.subject,
          html: personalizedHtml,
        };

        try {
          await mailTransport.sendMail(mailOptions);
          emailsSuccessfullySent++;
          functions.logger.info(`Campaign ${campaignId}: Email sent to ${contact.email}`);
        } catch (error) {
          functions.logger.error(`Campaign ${campaignId}: Failed to send email to ${contact.email}`, error);
          // Optionally, store individual send failures
        }
      });

      await Promise.all(emailPromises);

      functions.logger.info(`Campaign ${campaignId}: Finished sending. ${emailsSuccessfullySent}/${contacts.length} emails sent.`);

      // Update Campaign Status and Analytics
      const finalStatus = emailsSuccessfullySent > 0 || contacts.length === 0 ? "Enviada" : "Fallida";
      await db.collection("emailCampaigns").doc(campaignId).update({
        status: finalStatus,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        "analytics.totalRecipients": contacts.length,
        "analytics.emailsSent": emailsSuccessfullySent,
        // More detailed analytics (delivered, opened, clicked) would require webhooks or tracking pixels
      });

      return null;
    } catch (error) {
      functions.logger.error(`Campaign ${campaignId}: Error processing campaign:`, error);
      await db.collection("emailCampaigns").doc(campaignId).update({
        status: "Fallida",
        "analytics.totalRecipients": newData.analytics?.totalRecipients || 0,
        "analytics.emailsSent": newData.analytics?.emailsSent || 0,
        // You might want to add an error message field to the campaign document
      });
      return null;
    }
  });
