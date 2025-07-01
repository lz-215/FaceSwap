import Image from "next/image";
import { useTranslations } from 'next-intl';

export default function SectionFaceSwapTypes() {
  const t = useTranslations('FaceSwapTypes');
  const handleScrollToTop = () => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const cardContainerClasses = "w-full bg-white rounded-2xl shadow-xl p-6 flex flex-col items-start mt-0 border-2 border-slate-200";
  const cardTitleClasses = "text-xl font-bold text-slate-900 mb-2";
  const cardDescClasses = "text-sm text-slate-600 mb-4";
  const cardButtonClasses = "w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 rounded-lg mt-auto transition flex items-center justify-center gap-2";

  return (
    <section className="w-full flex flex-col items-center mt-20 mb-10">
      <h2 className="text-4xl font-extrabold text-sky-400 mb-3 text-center drop-shadow-lg">{t('title')}</h2>
      <p className="text-lg text-slate-400 mb-12 max-w-3xl text-center">{t('desc')}</p>
      <div className="flex flex-row gap-10 w-full justify-center">
        {/* Card 1: Festive Costume Dress-Up */}
        <div className="flex flex-col items-center w-80">
          {/* 上方图片区域：只显示一张合成效果图 */}
          <div className="relative w-72 h-44 rounded-xl overflow-hidden mb-0 flex items-center justify-center bg-black">
            <Image src="/images/demo7.jpg" alt="celebrity result" fill className="object-contain" />
          </div>
          {/* 下方内容区域 */}
          <div className={cardContainerClasses}>
            <h3 className={cardTitleClasses}>{t('card1Title')}</h3>
            <p className={cardDescClasses}>{t('card1Desc')}</p>
            <button className={cardButtonClasses} onClick={handleScrollToTop}>{t('swapNow')} <span className="text-lg">›</span></button>
          </div>
        </div>
        {/* Card 2: Meme Face Swap */}
        <div className="flex flex-col items-center w-80">
          {/* 上方图片区域：只显示一张合成效果图 */}
          <div className="relative w-72 h-44 rounded-xl overflow-hidden mb-0 flex items-center justify-center bg-black">
            <Image src="/images/demo10.png" alt="movie result" fill className="object-contain" />
          </div>
          {/* 下方内容区域 */}
          <div className={cardContainerClasses}>
            <h3 className={cardTitleClasses}>{t('card2Title')}</h3>
            <p className={cardDescClasses}>{t('card2Desc')}</p>
            <button className={cardButtonClasses} onClick={handleScrollToTop}>{t('swapNow')} <span className="text-lg">›</span></button>
          </div>
        </div>
        {/* Card 3: Anime Face Swap */}
        <div className="flex flex-col items-center w-80">
          {/* 上方图片区域：只显示一张合成效果图 */}
          <div className="relative w-72 h-44 rounded-xl overflow-hidden mb-0 flex items-center justify-center bg-black">
            <Image src="/images/demo6.jpg" alt="anime result" fill className="object-contain" />
          </div>
          {/* 下方内容区域 */}
          <div className={cardContainerClasses}>
            <h3 className={cardTitleClasses}>{t('card3Title')}</h3>
            <p className={cardDescClasses}>{t('card3Desc')}</p>
            <button className={cardButtonClasses} onClick={handleScrollToTop}>{t('swapNow')} <span className="text-lg">›</span></button>
          </div>
        </div>
      </div>
    </section>
  );
} 