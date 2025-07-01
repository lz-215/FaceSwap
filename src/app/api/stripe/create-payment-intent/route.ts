import { type NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { stripe } from "~/lib/stripe";

// Define the type for the request body
interface CreatePaymentIntentRequest {
  amount: number; // Amount in cents
  currency?: string;
}

/**
 * API endpoint to create a Stripe Payment Intent for one-time payments.
 *
 * @param request The request object containing the payment details.
 * @returns A response containing the client secret for the Payment Intent.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const requestData = await request.json().catch(() => ({}));
    const { amount, currency = "usd" }: CreatePaymentIntentRequest = requestData as CreatePaymentIntentRequest;

    // Validate the required parameters
    if (!amount || amount < 50) { // Stripe has a minimum amount, usually $0.50
      return NextResponse.json({
        error: "有效的金额是必需的（至少50美分）",
        type: "validation_error",
      }, { status: 400 });
    }

    // Log the request information
    console.log(`创建支付意图请求: amount=${amount}, currency=${currency}`);

    // Create the Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log(`支付意图创建成功: ${paymentIntent.id}`);

    // Build the success response
    const response = {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("创建支付意图失败:", error);

    // Handle Stripe-specific errors
    if (error instanceof Stripe.errors.StripeError) {
      const errorResponse = {
        code: error.code,
        decline_code: error.decline_code,
        error: error.message,
        http_status: error.statusCode,
        param: error.param,
        request_id: error.requestId,
        type: "stripe_error",
      };
      console.error(`Stripe 错误: ${JSON.stringify(errorResponse)}`);
      return NextResponse.json(errorResponse, { status: error.statusCode || 400 });
    }

    // Handle custom errors
    if (error instanceof Error) {
      const errorResponse = {
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        type: "api_error",
      };
      console.error(`API 错误: ${error.message}`);
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Handle unknown errors
    console.error(`未知错误: ${error}`);
    return NextResponse.json(
      {
        details: String(error),
        error: "创建支付意图时发生内部错误",
        type: "unknown_error",
      },
      { status: 500 },
    );
  }
} 
