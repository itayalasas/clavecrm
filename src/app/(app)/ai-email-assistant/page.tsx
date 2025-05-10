"use client";

import { useState } from "react";
import { EmailComposerForm } from "@/components/ai-email-assistant/email-composer-form";
import { generateEmailDraft, type EmailDraftInput, type EmailDraftOutput } from "@/ai/flows/email-generation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy } from "lucide-react";

export default function AiEmailAssistantPage() {
  const [generatedEmail, setGeneratedEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (data: EmailDraftInput) => {
    setIsLoading(true);
    setGeneratedEmail(null);
    try {
      const result: EmailDraftOutput = await generateEmailDraft(data);
      setGeneratedEmail(result.emailDraft);
      toast({
        title: "Email Draft Generated!",
        description: "Your personalized email draft is ready below.",
        variant: "default",
      });
    } catch (error) {
      console.error("Error generating email draft:", error);
      toast({
        title: "Error Generating Email",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (generatedEmail) {
      navigator.clipboard.writeText(generatedEmail)
        .then(() => {
          toast({ title: "Copied to Clipboard!", description: "Email draft copied." });
        })
        .catch(err => {
          console.error('Failed to copy: ', err);
          toast({ title: "Copy Failed", description: "Could not copy to clipboard.", variant: "destructive" });
        });
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 p-4 md:p-0">
      <EmailComposerForm onSubmit={handleSubmit} isLoading={isLoading} />

      {isLoading && (
        <Card className="w-full max-w-2xl animate-pulse">
          <CardHeader>
            <CardTitle>Generating Email Draft...</CardTitle>
            <CardDescription>Please wait while the AI crafts your email.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-full"></div>
            <div className="h-4 bg-muted rounded w-full"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </CardContent>
        </Card>
      )}

      {generatedEmail && !isLoading && (
        <Card className="w-full max-w-2xl shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Generated Email Draft</CardTitle>
              <CardDescription>Review and copy the draft below.</CardDescription>
            </div>
            <Button variant="outline" size="icon" onClick={handleCopyToClipboard} aria-label="Copy email draft">
              <Copy className="h-5 w-5" />
            </Button>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm font-sans bg-muted p-4 rounded-md overflow-x-auto">
              {generatedEmail}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
