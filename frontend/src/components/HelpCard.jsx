import { ArrowRight, Headset } from 'lucide-react';

// Where "Contact Support" goes: your support email when VITE_SUPPORT_EMAIL is set (the same address the billing page uses),
// otherwise the questions-and-answers on the public page.
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL;
export const supportHref = () => (SUPPORT_EMAIL ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('FitzyClub support')}` : '/?home#faq');

/** A soft green card in the light theme's sidebar. */
export default function HelpCard() {
  return (
    <div className="rounded-2xl border border-[#DDEFE7] bg-[#F1F8F6] p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-accent-strong shadow-sm"><Headset className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">Need help?</p>
          <p className="text-xs leading-snug text-gray-600">Our support team is here for you.</p>
        </div>
      </div>
      <a href={supportHref()} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-accent-strong px-4 py-1.5 text-sm font-medium text-accent-strong transition hover:bg-white">
        Contact support <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </a>
    </div>
  );
}
