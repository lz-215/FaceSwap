import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

// 定义请求体的类型
interface CreateSubscriptionRequest {
  customerId?: string;
  email?: string;
  name?: string;
  priceId: string;
}

/**
 * 创建 Stripe 订阅的 API 端点
 * 
 * @param request 包含订阅创建所需信息的请求
 * @returns 包含客户端密钥、客户ID和订阅ID的响应
 */
export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const requestData = await request.json().catch(() => ({}));
    const { customerId, email, name, priceId }: CreateSubscriptionRequest = requestData as CreateSubscriptionRequest;

    // 验证必需参数
    if (!priceId) {
      return NextResponse.json({ 
        error: "价格ID是必需的", 
        type: 'validation_error' 
      }, { status: 400 });
    }

    // 记录请求信息
    console.log(`创建订阅请求: priceId=${priceId}, customerId=${customerId || '新客户'}`);

    let customer: Stripe.Customer;

    if (customerId) {
      try {
        // 如果提供了客户ID，获取现有客户
        const retrievedCustomer = await stripe.customers.retrieve(customerId);
        
        // 检查客户是否已被删除
        if (retrievedCustomer.deleted) {
          throw new Error(`客户 ${customerId} 已被删除`);
        }
        
        customer = retrievedCustomer as Stripe.Customer;
        console.log(`使用现有客户: ${customer.id}`);
      } catch (error) {
        if (error instanceof Stripe.errors.StripeError) {
          // 处理 Stripe 错误，如客户不存在
          throw new Error(`获取客户失败: ${error.message}`);
        }
        throw error; // 重新抛出其他错误
      }
    } else {
      // 创建新客户
      customer = await stripe.customers.create({
        email: email || "test@example.com",
        name: name || "测试用户",
      });
      console.log(`创建了新客户: ${customer.id}`);
    }

    // 创建订阅
    console.log(`为客户 ${customer.id} 创建订阅，价格 ${priceId}`);
    let subscription: Stripe.Subscription;
    try {
      subscription = await stripe.subscriptions.create({
        customer: customer.id,
        expand: ["latest_invoice.payment_intent"],
        items: [
          {
            price: priceId,
          },
        ],
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
      });
      console.log(`订阅创建成功: ${subscription.id}, 状态: ${subscription.status}`);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        // 处理特定的 Stripe 错误
        if (error.code === 'resource_missing') {
          throw new Error(`创建订阅失败: 价格 ${priceId} 不存在`);
        }
        throw new Error(`创建订阅失败: ${error.message}`);
      }
      throw error; // 重新抛出其他错误
    }

    // 确保 latest_invoice 存在
    if (!subscription.latest_invoice) {
      throw new Error('无法获取订阅的发票信息：latest_invoice 不存在');
    }

    // 获取发票对象
    let invoice: Stripe.Invoice;
    if (typeof subscription.latest_invoice === 'string') {
      console.log(`latest_invoice 是字符串 ID: ${subscription.latest_invoice}，正在获取完整发票..`);
      invoice = await stripe.invoices.retrieve(subscription.latest_invoice, {
        expand: ['payment_intent']
      });
    } else {
      console.log('latest_invoice 已是完整对象');
      invoice = subscription.latest_invoice as Stripe.Invoice;
    }
    console.log(`发票获取成功: ${invoice.id}, 状态: ${invoice.status}`);

    // 获取 PaymentIntent
    let paymentIntent: null | Stripe.PaymentIntent = null;
    console.log(`开始获取发票 ${invoice.id} 的 PaymentIntent...`);

    // 方法1：从发票的 payment_intent 属性获取
    const invoiceWithPaymentIntent = invoice as any;
    if (invoiceWithPaymentIntent.payment_intent) {
      if (typeof invoiceWithPaymentIntent.payment_intent === 'string') {
        console.log(`payment_intent 是字符串 ID: ${invoiceWithPaymentIntent.payment_intent}，正在获取完整对象..`);
        paymentIntent = await stripe.paymentIntents.retrieve(invoiceWithPaymentIntent.payment_intent);
      } else {
        console.log('payment_intent 已是完整对象');
        paymentIntent = invoiceWithPaymentIntent.payment_intent as Stripe.PaymentIntent;
      }
      console.log(`通过 invoice.payment_intent 获取到 PaymentIntent: ${paymentIntent.id}`);
    }

    // 方法2：如果没有获取到，创建新的 PaymentIntent
    if (!paymentIntent) {
      console.log('未找到现有的 PaymentIntent，创建新的..');
      paymentIntent = await stripe.paymentIntents.create({
        amount: invoice.amount_due,
        currency: invoice.currency,
        customer: customer.id,
        metadata: {
          invoice_id: invoice.id || '',
          subscription_id: subscription.id || '',
        },
      });
      console.log(`创建了新的 PaymentIntent: ${paymentIntent.id}`);
    }

    // 确保 client_secret 存在
    if (!paymentIntent.client_secret) {
      throw new Error(`PaymentIntent ${paymentIntent.id} 没有 client_secret，状态: ${paymentIntent.status}`);
    }

    console.log(`成功获取 PaymentIntent: ${paymentIntent.id}, 状态: ${paymentIntent.status}`);

    // 构建成功响应
    const response = {
      clientSecret: paymentIntent.client_secret,
      customerId: customer.id,
      invoice: {
        amount_due: invoice.amount_due,
        currency: invoice.currency,
        id: invoice.id,
        status: invoice.status,
      },
      paymentIntent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
      },
      status: subscription.status,
      subscriptionId: subscription.id
    };

    console.log(`订阅创建成功，返回响应`);
    return NextResponse.json(response);

  } catch (error) {
    console.error("创建订阅失败:", error);

    // 处理 Stripe 错误
    if (error instanceof Stripe.errors.StripeError) {
      const errorResponse = {
        code: error.code,
        decline_code: error.decline_code,
        error: error.message,
        http_status: error.statusCode,
        param: error.param,
        request_id: error.requestId,
        type: 'stripe_error',
      };
      console.error(`Stripe 错误: ${JSON.stringify(errorResponse)}`);
      return NextResponse.json(errorResponse, { status: error.statusCode || 400 });
    }

    // 处理自定义错误
    if (error instanceof Error) {
      const errorResponse = {
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        type: 'api_error',
      };
      console.error(`API 错误: ${error.message}`);
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // 处理未知错误
    console.error(`未知错误: ${error}`);
    return NextResponse.json(
      {
        details: String(error),
        error: "创建订阅时发生内部错误",
        type: 'unknown_error',
      },
      { status: 500 },
    );
  }
}
