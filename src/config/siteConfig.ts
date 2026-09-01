// ============================================================================
// SINGLE SOURCE OF TRUTH for DJ VIC's factual claims (years, counts, socials).
// Import this anywhere a stat appears instead of hardcoding — so "19+ years",
// "since 2007", "300+ weddings" etc. can never drift out of sync again.
//
//   import { siteConfig as cfg } from "@/config/siteConfig";  // or a relative path
//   <p>Rocking weddings since {cfg.careerStart}</p>
//   <span>{cfg.yearsActive}+ years</span>
//
// Confirmed by DJ VIC (2026-09): career began 2007; ~19 years active;
// 300+ weddings; 300+ corporate; 18 countries; 1,400+ performances.
// ============================================================================

const CAREER_START = 2007;

export const siteConfig = {
  name: "DJ VIC",
  city: "Bangalore",

  // Career / experience — the 2005-vs-2007 and 19-vs-20 drift is resolved here.
  careerStart: CAREER_START,                                   // 2007
  yearsActive: new Date().getFullYear() - CAREER_START,        // auto-increments; "19+" in 2026

  // Volume claims (kept as display strings — they're approximate "X+" figures).
  countries: 18,
  performances: "1,400+",
  weddings: "300+",
  corporate: "300+",

  // Public profiles — also used verbatim as the Person schema `sameAs` array.
  social: {
    instagram: "https://www.instagram.com/djvicofficial",
    youtube: "https://www.youtube.com/@thedjvicofficial",
    spotify: "https://open.spotify.com/show/1pX6JpyY7oeZ6b2W6spZgw", // Vic Fix show (no artist page on file)
    facebook: "https://www.facebook.com/djvicofficial",
    audiomack: "https://audiomack.com/vrentertainment67",
  },

  get sameAs() {
    return [
      this.social.instagram, this.social.youtube, this.social.spotify,
      this.social.facebook, this.social.audiomack,
    ];
  },
};

export type SiteConfig = typeof siteConfig;
