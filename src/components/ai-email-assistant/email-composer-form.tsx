"use client";

import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { EmailDraftInput } from "@/ai/flows/email-generation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Sparkles } from "lucide-react";

const formSchema = z.object({
  leadName: z.string().min(1, "Lead name is required"),
  leadDetails: z.string().min(10, "Lead details must be at least 10 characters"),
  salesAgentName: z.string().min(1, "Sales agent name is required"),
  companyName: z.string().min(1, "Company name is required"),
  companyDescription: z.string().min(10, "Company description must be at least 10 characters"),
  emailPurpose: z.string().min(5, "Email purpose must be at least 5 characters"),
});

interface EmailComposerFormProps {
  onSubmit: (data: EmailDraftInput) => Promise<void>;
  isLoading: boolean;
}

export function EmailComposerForm({ onSubmit, isLoading }: EmailComposerFormProps) {
  const form = useForm<EmailDraftInput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      leadName: "",
      leadDetails: "",
      salesAgentName: "Your Name",
      companyName: "Your Company",
      companyDescription: "",
      emailPurpose: "Initial outreach",
    },
  });

  const handleFormSubmit: SubmitHandler<EmailDraftInput> = async (data) => {
    await onSubmit(data);
  };

  return (
    <Card className="w-full max-w-2xl shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          AI Email Assistant
        </CardTitle>
        <CardDescription>
          Provide details below and let AI craft a personalized email draft for your lead.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFormSubmit)}>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="leadName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Jane Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="salesAgentName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Name (Sales Agent)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., John Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="leadDetails"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead Details</FormLabel>
                  <FormControl>
                    <Textarea placeholder="e.g., Interested in product X, met at conference Y, works at Z Corp..." {...field} rows={3} />
                  </FormControl>
                  <FormDescription>Provide context about the lead and their company.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Company Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Acme Innovations" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="emailPurpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purpose of Email</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Follow-up, Introduction, Demo request" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="companyDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your Company Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="e.g., We help businesses achieve X by providing Y solutions..." {...field} rows={3} />
                  </FormControl>
                  <FormDescription>A brief description of what your company does.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isLoading} className="w-full md:w-auto">
              {isLoading ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating...
                </div>
              ) : (
                <div className="flex items-center">
                  <Sparkles className="mr-2 h-5 w-5" /> Generate Email Draft
                </div>
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
