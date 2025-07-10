// 通过API调用修复前端积分显示问题
async function fixCreditsViaAPI() {
  console.log('🔧 通过API修复前端积分显示问题...');

  try {
    // 调用数据库迁移API
    const response = await fetch('http://localhost:3000/api/database/migrate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API调用失败: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ 数据库迁移API调用成功:', result);

    if (result.success) {
      console.log('\n🎉 积分函数修复完成！');
      console.log('📋 修复内容:');
      console.log('   ✅ get_user_credits_v2函数已创建/更新');
      console.log('   ✅ 前端积分显示应该正常了');
      console.log('\n💡 现在请刷新浏览器页面查看效果');
    } else {
      console.error('❌ 修复失败:', result.error);
    }

  } catch (error) {
    console.error('❌ 修复过程中出现错误:', error.message);
    console.log('\n💡 请尝试以下解决方案:');
    console.log('   1. 确保开发服务器正在运行 (npm run dev)');
    console.log('   2. 访问 http://localhost:3000/debug-auth 页面');
    console.log('   3. 点击"下载完整修复脚本"按钮');
    console.log('   4. 在Supabase Dashboard中执行SQL脚本');
  }
}

// 检查是否在Node.js环境中运行
if (typeof window === 'undefined') {
  // Node.js环境，使用fetch polyfill
  import('node-fetch').then(({ default: fetch }) => {
    global.fetch = fetch;
    fixCreditsViaAPI();
  }).catch(() => {
    console.error('❌ 需要安装node-fetch: npm install node-fetch');
    console.log('💡 或者直接访问浏览器: http://localhost:3000/debug-auth');
  });
} else {
  // 浏览器环境
  fixCreditsViaAPI();
} 