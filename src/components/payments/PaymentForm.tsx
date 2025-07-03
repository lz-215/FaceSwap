"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSupabaseSession } from "~/lib/supabase-auth-client";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

interface PaymentFormProps {
  buttonText?: string;
  description?: string;
  onSuccess?: () => void;
  productId?: string;
  productSlug?: string;
  title?: string;
}

export function PaymentForm({
  buttonText = "Subscribe",
  description = "Get access to all premium features and support the project.",
  onSuccess,
  productId,
  productSlug = "pro",
  title = "Upgrade to Pro",
}: PaymentFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const { user } = useSupabaseSession();

  const handleCheckout = async () => {
    if (!user) {
      router.push("/auth/sign-in");
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      let url = "/auth/checkout";

      if (productSlug) {
        url += `/${productSlug}`;
      } else if (productId) {
        url += `?productId=${productId}`;
      }

      router.push(url);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Error initiating checkout:", error);
      setError("Failed to initiate checkout. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert className="mb-4" variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          disabled={isLoading}
          onClick={handleCheckout}
        >
          {isLoading ? "Loading..." : buttonText}
        </Button>
      </CardFooter>
    </Card>
  );
}
