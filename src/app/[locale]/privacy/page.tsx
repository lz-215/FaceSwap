import { useTranslations } from 'next-intl';

export default function PrivacyPage() {
  const t = useTranslations('PrivacyPolicy');
  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">{t('title')}</h1>
      <p className="mb-4">{t('lastUpdated')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">1. {t('introductionTitle')}</h2>
      <p className="mb-4">{t('introduction')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">2. {t('infoCollectTitle')}</h2>
      <p className="mb-4">{t('infoCollect')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">3. {t('infoUseTitle')}</h2>
      <p className="mb-4">{t('infoUse')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">4. {t('infoShareTitle')}</h2>
      <p className="mb-4">{t('infoShare')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">5. {t('dataSecurityTitle')}</h2>
      <p className="mb-4">{t('dataSecurity')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">6. {t('yourRightsTitle')}</h2>
      <p className="mb-4">{t('yourRights')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">7. {t('policyChangeTitle')}</h2>
      <p className="mb-4">{t('policyChange')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">8. {t('contactTitle')}</h2>
      <p>{t('contact')}</p>
    </div>
  );
} 