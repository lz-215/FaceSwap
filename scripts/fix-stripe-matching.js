#!/usr/bin/env node

/**
 * Stripe 用户匹配问题快速修复脚本
 * 
 * 用法: node scripts/fix-stripe-matching.js [action]
 * 
 * Actions:
 *   check    - 检查待处理的订阅数量
 *   fix      - 自动修复匹配问题
 *   manual   - 手动匹配指定的客户ID
 */

const ADMIN_API_BASE = process.env.NEXTAUTH_URL || 'http://localhost:3000';

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('请求失败:', error.message);
    throw error;
  }
}

async function checkPendingSubscriptions() {
  console.log('🔍 检查待处理的订阅...');
  
  try {
    const result = await makeRequest(
      `${ADMIN_API_BASE}/api/admin/stripe-matcher?action=pending-subscriptions`
    );

    if (result.success) {
      console.log(`📊 发现 ${result.count} 个待处理订阅`);
      
      if (result.count > 0) {
        console.log('\n待处理订阅列表:');
        result.data.forEach((sub, index) => {
          console.log(`${index + 1}. 订阅ID: ${sub.subscription_id}`);
          console.log(`   客户ID: ${sub.customer_id}`);
          console.log(`   状态: ${sub.status}`);
          console.log(`   创建时间: ${new Date(sub.created_at).toLocaleString()}`);
          console.log('');
        });
      }

      return result.data;
    } else {
      throw new Error('获取待处理订阅失败');
    }
  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    return [];
  }
}

async function autoFixMatching() {
  console.log('🔧 开始自动修复匹配问题...');
  
  try {
    // 1. 获取待处理订阅
    const pendingSubscriptions = await checkPendingSubscriptions();
    
    if (pendingSubscriptions.length === 0) {
      console.log('✅ 没有待处理的订阅');
      return;
    }

    // 2. 提取唯一的客户ID
    const customerIds = [...new Set(pendingSubscriptions.map(sub => sub.customer_id))];
    console.log(`🎯 找到 ${customerIds.length} 个唯一客户ID`);

    // 3. 批量自动匹配
    console.log('🚀 开始批量匹配...');
    const result = await makeRequest(`${ADMIN_API_BASE}/api/admin/stripe-matcher`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'batch-match',
        customerIds: customerIds,
      }),
    });

    if (result.success) {
      console.log(`✅ ${result.message}`);
      
      const successCount = result.data.filter(r => r.success).length;
      const failedCount = result.data.length - successCount;

      console.log('\n📈 匹配结果统计:');
      console.log(`成功: ${successCount}`);
      console.log(`失败: ${failedCount}`);

      if (failedCount > 0) {
        console.log('\n❌ 失败的客户ID:');
        result.data
          .filter(r => !r.success)
          .forEach(r => {
            console.log(`- ${r.customerId}: ${r.reason || r.error}`);
          });
        
        console.log('\n💡 建议: 使用手动匹配处理失败的客户');
      }
    } else {
      throw new Error(result.error || '批量匹配失败');
    }
  } catch (error) {
    console.error('❌ 自动修复失败:', error.message);
  }
}

async function manualMatch(customerId, userId) {
  console.log(`🔗 手动匹配客户 ${customerId} 到用户 ${userId}...`);
  
  try {
    const result = await makeRequest(`${ADMIN_API_BASE}/api/admin/stripe-matcher`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'manual-match',
        customerId: customerId,
        userId: userId,
        note: 'Script manual fix',
      }),
    });

    if (result.success) {
      console.log('✅ 手动匹配成功!');
      console.log(`修复了 ${result.data.fixedSubscriptions} 个待处理订阅`);
    } else {
      throw new Error(result.error || '手动匹配失败');
    }
  } catch (error) {
    console.error('❌ 手动匹配失败:', error.message);
  }
}

async function searchCustomerInfo(customerId) {
  console.log(`🔍 查找客户信息: ${customerId}...`);
  
  try {
    const result = await makeRequest(
      `${ADMIN_API_BASE}/api/admin/stripe-matcher?action=customer-info&customerId=${customerId}`
    );

    if (result.success) {
      const customer = result.data;
      console.log('\n📋 客户信息:');
      console.log(`ID: ${customer.id}`);
      console.log(`邮箱: ${customer.email}`);
      console.log(`姓名: ${customer.name}`);
      console.log(`创建时间: ${new Date(customer.created * 1000).toLocaleString()}`);
      console.log(`已删除: ${customer.deleted ? '是' : '否'}`);
      
      if (customer.metadata && Object.keys(customer.metadata).length > 0) {
        console.log('\n🏷️  元数据:');
        Object.entries(customer.metadata).forEach(([key, value]) => {
          console.log(`${key}: ${value}`);
        });
      }
      
      return customer;
    } else {
      throw new Error(result.error || '获取客户信息失败');
    }
  } catch (error) {
    console.error('❌ 查找客户信息失败:', error.message);
    return null;
  }
}

async function searchUsers(query) {
  console.log(`🔍 搜索用户: ${query}...`);
  
  try {
    const result = await makeRequest(
      `${ADMIN_API_BASE}/api/admin/stripe-matcher?action=search-users&query=${encodeURIComponent(query)}`
    );

    if (result.success) {
      console.log(`\n👥 找到 ${result.count} 个用户:`);
      result.data.forEach((user, index) => {
        console.log(`${index + 1}. ${user.email} (${user.name})`);
        console.log(`   ID: ${user.id}`);
        console.log(`   创建时间: ${new Date(user.created_at).toLocaleString()}`);
        console.log('');
      });
      
      return result.data;
    } else {
      throw new Error(result.error || '搜索用户失败');
    }
  } catch (error) {
    console.error('❌ 搜索用户失败:', error.message);
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const action = args[0];

  console.log('🚀 Stripe 用户匹配修复工具');
  console.log('================================\n');

  switch (action) {
    case 'check':
      await checkPendingSubscriptions();
      break;
    
    case 'fix':
      await autoFixMatching();
      break;
    
    case 'manual':
      const customerId = args[1];
      const userId = args[2];
      
      if (!customerId || !userId) {
        console.error('❌ 手动匹配需要提供客户ID和用户ID');
        console.log('用法: node scripts/fix-stripe-matching.js manual <customer_id> <user_id>');
        process.exit(1);
      }
      
      await manualMatch(customerId, userId);
      break;
    
    case 'info':
      const targetCustomerId = args[1];
      
      if (!targetCustomerId) {
        console.error('❌ 需要提供客户ID');
        console.log('用法: node scripts/fix-stripe-matching.js info <customer_id>');
        process.exit(1);
      }
      
      await searchCustomerInfo(targetCustomerId);
      break;
    
    case 'search':
      const query = args[1];
      
      if (!query) {
        console.error('❌ 需要提供搜索查询');
        console.log('用法: node scripts/fix-stripe-matching.js search <email_or_name>');
        process.exit(1);
      }
      
      await searchUsers(query);
      break;
    
    default:
      console.log('使用方法:');
      console.log('  node scripts/fix-stripe-matching.js check                          - 检查待处理订阅');
      console.log('  node scripts/fix-stripe-matching.js fix                            - 自动修复匹配');
      console.log('  node scripts/fix-stripe-matching.js manual <customer_id> <user_id> - 手动匹配');
      console.log('  node scripts/fix-stripe-matching.js info <customer_id>             - 查看客户信息');
      console.log('  node scripts/fix-stripe-matching.js search <email_or_name>         - 搜索用户');
      console.log('');
      console.log('示例:');
      console.log('  node scripts/fix-stripe-matching.js check');
      console.log('  node scripts/fix-stripe-matching.js fix');
      console.log('  node scripts/fix-stripe-matching.js manual cus_xxxxx user_12345');
      console.log('  node scripts/fix-stripe-matching.js info cus_xxxxx');
      console.log('  node scripts/fix-stripe-matching.js search john@example.com');
      break;
  }
}

// 如果脚本是直接运行的
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 脚本执行失败:', error.message);
    process.exit(1);
  });
}

module.exports = {
  checkPendingSubscriptions,
  autoFixMatching,
  manualMatch,
  searchCustomerInfo,
  searchUsers,
}; 