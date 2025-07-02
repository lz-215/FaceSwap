# Stripe订阅配置说明

## 概览
本项目已将Stripe Pricing Table替换为自定义的订阅卡片组件，提供单一专业版产品的月付和年付选项。

## 订阅详情
- **月付计划**: $16.9/月，获得120积分
- **年付计划**: $118.8/年，获得1800积分 
- **积分过期**: 订阅期结束时积分过期

## 配置步骤

### 1. 环境变量配置
在您的`.env.local`文件中添加以下环境变量：

```bash
# Stripe基础配置
STRIPE_SECRET_KEY=REMOVED_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key

# 订阅价格ID (需要在Stripe Dashboard中创建)
NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID=price_monthly_id
NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID=price_yearly_id

# 应用URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. Stripe Dashboard配置

#### 创建产品和价格
1. 登录到 [Stripe Dashboard](https://dashboard.stripe.com)
2. 导航到 **Products** > **Catalog**
3. 创建以下产品和价格：

**专业版积分套餐：**
- 产品名称：Pro Credits Package
- 月付价格：$16.9/月 (复制价格ID到 `NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID`)
- 年付价格：$118/年 (复制价格ID到 `NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID`)

**积分分配：**
- 月付：120积分/月
- 年付：1800积分/年 (相当于150积分/月)

#### 配置Webhook
1. 在Stripe Dashboard中，导航到 **Developers** > **Webhooks**
2. 点击 **Add endpoint**
3. 添加端点URL：`https://yourdomain.com/api/webhooks/stripe`
4. 选择以下事件：
   - `customer.subscription.created`
   - `customer.subscription.updated` 
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

### 3. 主要变更说明

#### 替换的组件
- ❌ 移除：`<stripe-pricing-table>` HTML组件
- ❌ 移除：Stripe Pricing Table 脚本加载
- ✅ 新增：`<SubscriptionCards>` React组件

#### 新增的API端点
- `/api/stripe/checkout` - 创建Stripe Checkout会话

#### 主要特性
- ✅ 支持月付和年付切换
- ✅ 响应式设计
- ✅ 多语言支持 (中文/英文)
- ✅ 认证状态检查
- ✅ 错误处理和加载状态
- ✅ 与现有Supabase认证集成
- ✅ 积分数量动态显示
- ✅ 年付节省金额计算

### 4. 使用方法

#### 基本使用
```tsx
import { SubscriptionCards } from "~/components/pricing/subscription-cards";

export default function PricingPage() {
  return (
    <div>
      <SubscriptionCards locale="zh" />
    </div>
  );
}
```

#### 自定义配置
如需修改价格或积分数量，请编辑：
- `src/components/pricing/subscription-cards.tsx` - 订阅配置
- 环境变量 - 价格ID

### 5. 测试

#### 测试流程
1. 启动开发服务器：`npm run dev`
2. 访问定价页面：`http://localhost:3000/pricing`
3. 测试月付/年付切换功能
4. 测试登录状态下的订阅流程
5. 使用Stripe测试卡号进行支付测试

#### Stripe测试卡号
- 成功支付：`4242 4242 4242 4242`
- 失败支付：`4000 0000 0000 0002`

### 6. 积分管理

#### 积分分配逻辑
- 月付订阅：每月获得120积分
- 年付订阅：一次性获得1800积分
- 积分过期：订阅结束时所有积分清零

#### 年付优势
- **价格优势**: 年付相当于每月$9.83，比月付$16.9节省$6.93/月
- **积分优势**: 年付1800积分相当于150积分/月，比月付120积分/月多30积分

### 7. 故障排除

#### 常见问题
1. **价格ID错误**：确保环境变量中的价格ID与Stripe Dashboard中的一致
2. **认证失败**：检查Supabase配置和用户登录状态
3. **重定向失败**：确认 `NEXT_PUBLIC_APP_URL` 配置正确
4. **积分计算错误**：检查订阅配置中的积分数量设置

#### 调试技巧
- 检查浏览器控制台中的错误信息
- 在Stripe Dashboard中查看事件日志
- 使用Stripe CLI进行本地webhook测试
- 验证积分数量显示是否正确

### 8. 部署注意事项

#### 生产环境配置
1. 将测试密钥替换为生产密钥
2. 更新 `NEXT_PUBLIC_APP_URL` 为生产域名
3. 配置生产环境的webhook端点
4. 测试完整的支付流程
5. 验证积分分配逻辑

---

## 技术细节

### 项目结构
```
src/
├── components/pricing/
│   └── subscription-cards.tsx    # 主要订阅卡片组件
├── app/api/stripe/
│   └── checkout/route.ts         # Checkout API端点
├── hooks/
│   └── use-toast.ts              # Toast通知hook
└── app/[locale]/pricing/
    └── page.tsx                  # 更新后的定价页面
```

### 订阅配置结构
```typescript
const subscription = {
  monthlyPrice: 16.9,
  yearlyPrice: 118,
  monthlyCredits: 120,
  yearlyCredits: 1800,
  monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID,
  yearlyPriceId: process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID,
};
```

### UI特性
- **动态价格显示**: 根据选择的计费周期显示对应价格
- **积分高亮**: 突出显示当前选择包含的积分数量
- **节省提醒**: 年付选项显示每月节省金额
- **过期警告**: 明确说明积分过期政策
- **响应式设计**: 适配各种设备屏幕

### 依赖关系
- Stripe JavaScript SDK
- Supabase认证
- Tailwind CSS (样式)
- Lucide React (图标)
- Sonner (Toast通知)

此配置提供了一个清晰、简洁的单一产品订阅系统，重点突出积分价值和年付优势。 