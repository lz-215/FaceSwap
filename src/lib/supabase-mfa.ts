import { supabaseClient } from './supabase-auth-client';

/**
 * 双因素认证（Two-Factor Authentication）功能封装
 * 使用 Supabase Auth MFA API 实现
 */
export const twoFactor = {
  /**
   * 禁用双因素认证
   * @param params 包含用户密码的参数对象
   * @returns 操作结果
   */
  disable: async ({ password }: { password: string }) => {
    try {
      // 1. 验证用户密码
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: (await supabaseClient.auth.getUser()).data.user?.email || '',
        password,
      });

      if (signInError) {
        throw new Error('密码验证失败');
      }

      // 2. 获取当前已注册的因子
      const { data: factorsData, error: factorsError } = await supabaseClient.auth.mfa.listFactors();

      if (factorsError) {
        throw new Error('获取 MFA 因子失败');
      }

      // 3. 找到已验证的 TOTP 因子
      const totpFactor = factorsData.totp.find(factor => factor.status === 'verified');

      if (!totpFactor) {
        throw new Error('未找到已验证的 TOTP 因子');
      }

      // 4. 取消注册该因子
      const { error: unenrollError } = await supabaseClient.auth.mfa.unenroll({
        factorId: totpFactor.id,
      });

      if (unenrollError) {
        throw new Error('取消注册 TOTP 因子失败');
      }

      return { success: true };
    } catch (error) {
      console.error('禁用双因素认证失败', error);
      return { error };
    }
  },

  /**
   * 启用双因素认证
   * @param params 包含用户密码的参数对象
   * @returns 包含 TOTP URI 的结果，用于生成 QR 码
   */
  enable: async ({ password }: { password: string }) => {
    try {
      // 1. 验证用户密码
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: (await supabaseClient.auth.getUser()).data.user?.email || '',
        password,
      });

      if (signInError) {
        throw new Error('密码验证失败');
      }

      // 2. 注册新的 TOTP 因子
      const { data: factorData, error: factorError } = await supabaseClient.auth.mfa.enroll({
        factorType: 'totp',
      });

      if (factorError || !factorData) {
        throw new Error('注册 TOTP 因子失败');
      }

      // 返回 TOTP URI，用于生成 QR 码
      return {
        data: {
          secret: factorData.totp.secret,
          totpURI: factorData.totp.qr_code,
        },
      };
    } catch (error) {
      console.error('启用双因素认证失败', error);
      return { error };
    }
  },

  /**
   * 获取当前用户的 MFA 状态
   * @returns MFA 状态信息
   */
  getStatus: async () => {
    try {
      const { data, error } = await supabaseClient.auth.mfa.listFactors();

      if (error) {
        throw new Error('获取 MFA 状态失败');
      }

      const hasEnabledTotp = data.totp.some(factor => factor.status === 'verified');

      return {
        data: {
          enabled: hasEnabledTotp,
          factors: data,
        },
      };
    } catch (error) {
      console.error('获取 MFA 状态失败', error);
      return { error };
    }
  },

  /**
   * 验证 TOTP 代码
   * @param params 包含 TOTP 代码和因子 ID 的参数对象
   * @returns 验证结果
   */
  verify: async ({ code, factorId }: { code: string; factorId: string }) => {
    try {
      // 1. 创建验证挑战
      const { data: challengeData, error: challengeError } = await supabaseClient.auth.mfa.challenge({
        factorId,
      });

      if (challengeError || !challengeData) {
        throw new Error('创建验证挑战失败');
      }

      // 2. 验证 TOTP 代码
      const { data: verifyData, error: verifyError } = await supabaseClient.auth.mfa.verify({
        challengeId: challengeData.id,
        code,
        factorId,
      });

      if (verifyError || !verifyData) {
        throw new Error('验证 TOTP 代码失败');
      }

      return { success: true };
    } catch (error) {
      console.error('验证 TOTP 代码失败:', error);
      return { error };
    }
  },
};
