// EmailGeneration.ts
'use server';
/**
 * @fileOverview This file defines a Genkit flow for generating personalized email drafts for leads.
 *
 * - generateEmailDraft - A function that takes lead information and generates an email draft.
 * - EmailDraftInput - The input type for the generateEmailDraft function.
 * - EmailDraftOutput - The return type for the generateEmailDraft function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const EmailDraftInputSchema = z.object({
  leadName: z.string().describe('The name of the lead.'),
  leadDetails: z.string().describe('Details about the lead and their company.'),
  salesAgentName: z.string().describe('The name of the sales agent.'),
  companyName: z.string().describe('The name of the agent company.'),
  companyDescription: z.string().describe('Brief Description of the agent company.'),
  emailPurpose: z.string().describe('The purpose of the email.'),
});
export type EmailDraftInput = z.infer<typeof EmailDraftInputSchema>;

const EmailDraftOutputSchema = z.object({
  emailDraft: z.string().describe('The generated email draft.'),
});
export type EmailDraftOutput = z.infer<typeof EmailDraftOutputSchema>;

export async function generateEmailDraft(input: EmailDraftInput): Promise<EmailDraftOutput> {
  return generateEmailDraftFlow(input);
}

const generateEmailPrompt = ai.definePrompt({
  name: 'generateEmailPrompt',
  input: {schema: EmailDraftInputSchema},
  output: {schema: EmailDraftOutputSchema},
  prompt: `You are an AI email assistant designed to generate personalized email drafts for sales agents.

  Based on the information provided, create an email draft that the sales agent can use to communicate with the lead.

  Lead Name: {{{leadName}}}
  Lead Details: {{{leadDetails}}}
  Sales Agent Name: {{{salesAgentName}}}
  Company Name: {{{companyName}}}
  Company Description: {{{companyDescription}}}
  Email Purpose: {{{emailPurpose}}}
  
  Email Draft:`, // No need to be too verbose, this is an email
});

const generateEmailDraftFlow = ai.defineFlow(
  {
    name: 'generateEmailDraftFlow',
    inputSchema: EmailDraftInputSchema,
    outputSchema: EmailDraftOutputSchema,
  },
  async input => {
    const {output} = await generateEmailPrompt(input);
    return output!;
  }
);
