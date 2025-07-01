import { useTranslations } from 'next-intl';

export default function TermsPage() {
  const t = useTranslations('TermsOfService');
  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6">{t('title')}</h1>
      <p className="mb-4">{t('lastUpdated')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">1. {t('acceptanceTitle')}</h2>
      <p className="mb-4">{t('acceptance')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">2. {t('useTitle')}</h2>
      <p className="mb-4">{t('use')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">3. {t('ipTitle')}</h2>
      <p className="mb-4">{t('ip')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">4. {t('terminationTitle')}</h2>
      <p className="mb-4">{t('termination')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">5. {t('disclaimerTitle')}</h2>
      <p className="mb-4">{t('disclaimer')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">6. {t('liabilityTitle')}</h2>
      <p className="mb-4">{t('liability')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">7. {t('termsChangeTitle')}</h2>
      <p className="mb-4">{t('termsChange')}</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">8. {t('contactTitle')}</h2>
      <p>{t('contact')}</p>
    </div>
  );
} 