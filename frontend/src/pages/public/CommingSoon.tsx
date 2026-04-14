import { Link, useSearchParams } from "react-router-dom";
import { FaInstagram, FaWhatsapp, FaPhone } from "react-icons/fa";
import { GiTennisBall, GiTennisRacket } from "react-icons/gi";
import PricingDisplay from "src/components/shared/PricingDisplay";

const IMAGES = [
  "/images/ultimate-padel-vibe.jpeg",
  "/images/club-coming-soon.jpeg",
  "/images/from-court-to-cafe.jpeg",
  "/images/padel-club-count-down.jpeg",
];

function CommingSoon() {
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get("ref");
  const registerPath = referralCode
    ? `/register?ref=${referralCode}`
    : "/register";

  return (
    <div className="dark min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 sm:px-8 py-3 sm:py-4 bg-background/90 backdrop-blur-md border-b border-border/20">
        <img
          src="/logo.png"
          alt="Padel Mania"
          className="h-10 sm:h-12 w-auto"
        />
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-sm font-semibold text-foreground/60 hover:text-foreground transition-colors px-4 py-2"
          >
            Login
          </Link>
          <Link
            to={registerPath}
            className="text-sm font-black text-primary-foreground bg-primary hover:bg-primary/80 transition-colors px-5 py-2.5 uppercase tracking-wider"
          >
            Join Now
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex items-end overflow-hidden pt-20">
        <div className="absolute inset-0">
          <img
            src="/images/banner.avif"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />
        </div>

        <div
          className="absolute top-0 right-0 w-1 h-full opacity-40 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--color-primary), transparent)",
          }}
        />

        <div className="relative z-10 w-full pb-16 sm:pb-24 px-5 sm:px-10 lg:px-16">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-8 h-px bg-primary" />
              <span className="text-primary text-xs sm:text-sm font-black uppercase tracking-[0.2em]">
                Now Open · Nairobi
              </span>
            </div>

            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black leading-none uppercase mb-6">
              <span className="block text-foreground">Play</span>
              <span className="block text-foreground">Like a</span>
              <span
                className="block"
                style={{
                  WebkitTextStroke: "2px var(--color-primary)",
                  color: "transparent",
                }}
              >
                Champion.
              </span>
            </h1>

            <p className="text-base sm:text-lg text-foreground/60 max-w-lg mb-10 leading-relaxed">
              Padel Mania's premier padel destination — two world-class courts,
              professional equipment, and a community built for champions.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to={registerPath}
                className="group inline-flex items-center justify-center gap-3 bg-primary text-primary-foreground px-8 py-4 text-sm sm:text-base font-black uppercase tracking-widest hover:bg-primary/80 transition-colors duration-200"
              >
                <GiTennisRacket className="w-5 h-5" />
                Create Account
                <svg
                  className="w-4 h-4 group-hover:translate-x-1 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 border border-foreground/20 text-foreground px-8 py-4 text-sm sm:text-base font-bold uppercase tracking-widest hover:border-foreground/50 hover:bg-foreground/5 transition-all duration-200"
              >
                Member Login
              </Link>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 right-8 sm:right-12 flex flex-col items-center gap-2 opacity-50">
          <span className="text-xs uppercase tracking-[0.2em] text-foreground/60 rotate-90 whitespace-nowrap">
            Scroll
          </span>
          <div className="w-px h-12 bg-foreground/40 animate-pulse" />
        </div>
      </section>

      {/* STATS BAR */}
      <section className="border-y border-border/20 bg-card">
        <div className="max-w-7xl mx-auto px-5 sm:px-10 py-6 grid grid-cols-2 md:grid-cols-4 divide-x divide-border/20">
          {[
            { value: "2", label: "Premium Courts" },
            { value: "100%", label: "Glass Walls" },
            { value: "LED", label: "Pro Lighting" },
            { value: "Nairobi", label: "Nairobi" },
          ].map((stat, i) => (
            <div
              key={i}
              className="text-center px-4 py-4 sm:py-6 first:pl-0 last:pr-0"
            >
              <p className="text-3xl sm:text-4xl font-black text-primary tabular-nums">
                {stat.value}
              </p>
              <p className="text-xs text-foreground/40 uppercase tracking-widest mt-1 font-semibold">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* COURTS */}
      <section className="py-20 sm:py-28 px-5 sm:px-10 lg:px-16 max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start mb-14">
          <div className="flex-1">
            <p className="text-primary text-xs font-black uppercase tracking-[0.25em] mb-4 flex items-center gap-2">
              <span className="w-6 h-px bg-primary" />
              Our Facilities
            </p>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black uppercase leading-none">
              Two Courts.
              <br />
              <span className="text-foreground/30">Zero Compromise.</span>
            </h2>
          </div>
          <p className="text-foreground/50 max-w-sm text-sm sm:text-base leading-relaxed lg:pt-14">
            Both courts are built to international standards — glass walls, LED
            lighting, and surfaces that deliver every shot exactly as intended.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
          {/* Court A */}
          <div className="group relative overflow-hidden bg-card border border-border/10 hover:border-primary/40 transition-colors duration-500">
            <div className="relative overflow-hidden h-64 sm:h-80">
              <img
                src="/images/ultimate-padel-vibe.jpeg"
                alt="Court A"
                className="w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-105 transition-all duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              <span className="absolute top-4 left-4 text-[10px] font-black uppercase tracking-[0.3em] bg-primary text-primary-foreground px-3 py-1">
                Court A
              </span>
            </div>
            <div className="p-6 sm:p-8">
              <h3 className="text-2xl font-black uppercase mb-3 text-foreground group-hover:text-primary transition-colors duration-300">
                Tournament Grade
              </h3>
              <p className="text-foreground/50 text-sm leading-relaxed mb-6">
                Championship-quality playing surface with professional lighting
                and premium full-glass walls for maximum visibility.
              </p>
              <Link
                to={registerPath}
                className="inline-flex items-center gap-2 text-primary text-sm font-black uppercase tracking-wider hover:gap-4 transition-all duration-300"
              >
                Reserve this court
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </Link>
            </div>
          </div>

          {/* Court B */}
          <div className="group relative overflow-hidden bg-card border border-border/10 hover:border-primary/40 transition-colors duration-500">
            <div className="relative overflow-hidden h-64 sm:h-80">
              <img
                src="/images/club-coming-soon.jpeg"
                alt="Court B"
                className="w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-105 transition-all duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              <span className="absolute top-4 left-4 text-[10px] font-black uppercase tracking-[0.3em] bg-foreground text-background px-3 py-1">
                Court B
              </span>
            </div>
            <div className="p-6 sm:p-8">
              <h3 className="text-2xl font-black uppercase mb-3 text-foreground group-hover:text-primary transition-colors duration-300">
                Spectator Ready
              </h3>
              <p className="text-foreground/50 text-sm leading-relaxed mb-6">
                Advanced court surface with optimal LED lighting and a
                spectator-friendly design that brings the crowd closer to the
                action.
              </p>
              <Link
                to={registerPath}
                className="inline-flex items-center gap-2 text-primary text-sm font-black uppercase tracking-wider hover:gap-4 transition-all duration-300"
              >
                Reserve this court
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/10">
          {[
            "Pro-Grade Surface",
            "LED Lighting",
            "Perfect Dimensions",
            "Spectator Area",
          ].map((f, i) => (
            <div key={i} className="bg-background px-6 py-5 text-center">
              <p className="text-foreground/70 text-xs font-black uppercase tracking-widest">
                {f}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FULL-WIDTH IMAGE BREAK */}
      <div className="relative h-56 sm:h-72 overflow-hidden">
        <img
          src="/images/from-court-to-cafe.jpeg"
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
          <p className="text-foreground/20 text-5xl sm:text-7xl lg:text-9xl font-black uppercase tracking-tighter select-none">
            PADEL MANIA
          </p>
        </div>
      </div>

      {/* PRICING */}
      <PricingDisplay />

      {/* EQUIPMENT */}
      <section className="py-20 sm:py-28 bg-card border-y border-border/10">
        <div className="max-w-7xl mx-auto px-5 sm:px-10 lg:px-16">
          <div className="mb-14">
            <p className="text-primary text-xs font-black uppercase tracking-[0.25em] mb-4 flex items-center gap-2">
              <span className="w-6 h-px bg-primary" />
              Gear Up
            </p>
            <h2 className="text-4xl sm:text-5xl font-black uppercase leading-none">
              Equipment
              <br />
              <span className="text-foreground/30">Rental</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-px bg-border/10">
            <div className="group bg-card p-8 sm:p-12 hover:bg-muted transition-colors duration-300">
              <div className="flex items-start justify-between mb-8">
                <div className="w-14 h-14 bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-300">
                  <GiTennisRacket className="w-7 h-7 text-primary" />
                </div>
                <span className="text-3xl sm:text-4xl font-black tabular-nums text-foreground">
                  Ksh&nbsp;200
                </span>
              </div>
              <h4 className="text-xl sm:text-2xl font-black uppercase mb-2 text-foreground">
                Premium Rackets
              </h4>
              <p className="text-foreground/40 text-sm mb-1">
                Top-quality professional rackets
              </p>
              <p className="text-primary text-xs font-black uppercase tracking-wider">
                per racket / hour
              </p>
            </div>

            <div className="group bg-card p-8 sm:p-12 hover:bg-muted transition-colors duration-300">
              <div className="flex items-start justify-between mb-8">
                <div className="w-14 h-14 bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-300">
                  <GiTennisBall className="w-7 h-7 text-primary" />
                </div>
                <span className="text-3xl sm:text-4xl font-black tabular-nums text-foreground">
                  Ksh&nbsp;1,000
                </span>
              </div>
              <h4 className="text-xl sm:text-2xl font-black uppercase mb-2 text-foreground">
                Ball Packs
              </h4>
              <p className="text-foreground/40 text-sm mb-1">
                Fresh premium balls every game
              </p>
              <p className="text-primary text-xs font-black uppercase tracking-wider">
                per pack (3 balls)
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* PHOTO STRIP */}
      <section className="py-12 overflow-hidden bg-background">
        <div
          className="flex gap-3 animate-slide-left"
          style={{ width: "max-content" }}
        >
          {[...IMAGES, ...IMAGES, ...IMAGES].map((src, i) => (
            <div
              key={i}
              className="relative flex-shrink-0"
              style={{ width: "260px", height: "180px" }}
            >
              <img
                src={src}
                alt=""
                className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-500"
              />
            </div>
          ))}
        </div>
      </section>

      {/* LOCATION */}
      <section className="py-20 sm:py-28 bg-card border-t border-border/10">
        <div className="max-w-7xl mx-auto px-5 sm:px-10 lg:px-16">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            <div>
              <p className="text-primary text-xs font-black uppercase tracking-[0.25em] mb-4 flex items-center gap-2">
                <span className="w-6 h-px bg-primary" />
                Find Us
              </p>
              <h2 className="text-4xl sm:text-5xl font-black uppercase leading-none mb-6">
                Come
                <br />
                <span className="text-foreground/30">Play With Us</span>
              </h2>
              <p className="text-foreground/50 text-sm sm:text-base leading-relaxed mb-8">
                We're located in the heart of Nairobi. Easy to reach, impossible
                to forget once you've played here.
              </p>
              <div className="space-y-4 mb-10">
                {[
                  {
                    icon: "",
                    label: "Location",
                    value: "Nairobi, Kenya",
                  },
                  { icon: "", label: "Phone", value: "+254 742 754 354" },
                  { icon: "", label: "Instagram", value: "@padelmanialtd" },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-4 border-b border-border/10 pb-4 last:border-0"
                  >
                    <span className="text-lg">{item.icon}</span>
                    <div>
                      <p className="text-foreground/30 text-[10px] uppercase tracking-widest font-black">
                        {item.label}
                      </p>
                      <p className="text-foreground text-sm font-semibold mt-0.5">
                        {item.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <a
                href="https://maps.google.com/?q=Padel+Mania"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-3 bg-primary text-primary-foreground px-7 py-4 text-sm font-black uppercase tracking-widest hover:bg-primary/80 transition-colors duration-200"
              >
                Get Directions
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </a>
            </div>

            <div className="border border-border/20 overflow-hidden">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1195.9155291756977!2d36.789932564026394!3d-1.2500588626388816!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x182f17002ba1191d%3A0xac0016dee7064f42!2sPadel%20Mania!5e0!3m2!1sen!2ske!4v1776087028305!5m2!1sen!2ske"
                width="100%"
                height="420"
                style={{ border: 0, display: "block" }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Padel Mania Location"
                className="grayscale hover:grayscale-0 transition-all duration-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FLOATING CONTACT */}
      <div
        className="fixed right-4 z-50 flex flex-col items-end gap-3"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
      >
        <div className="group relative">
          <a
            href="https://wa.me/254742754354?text=Hello%20Padel%20Mania"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="flex items-center justify-center w-11 h-11 bg-[#25d366] text-white hover:scale-110 transition-transform shadow-lg shadow-black/40"
          >
            <FaWhatsapp className="w-5 h-5" />
          </a>
          <span className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-3 bg-card text-foreground text-xs font-semibold px-3 py-1.5 whitespace-nowrap opacity-0 translate-x-1 group-hover:translate-x-0 group-hover:opacity-100 transition-all hidden sm:block">
            Chat with us
          </span>
        </div>

        <div className="group relative">
          <a
            href="tel:+254000000000"
            aria-label="Call us"
            className="flex items-center justify-center w-11 h-11 bg-primary text-primary-foreground hover:scale-110 transition-transform shadow-lg shadow-black/40"
          >
            <FaPhone className="w-4 h-4" />
          </a>
          <span className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-3 bg-card text-foreground text-xs font-semibold px-3 py-1.5 whitespace-nowrap opacity-0 translate-x-1 group-hover:translate-x-0 group-hover:opacity-100 transition-all hidden sm:block">
            Give us a call
          </span>
        </div>

        <div className="group relative">
          <a
            href="https://www.instagram.com/padelmanialtd"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="flex items-center justify-center w-11 h-11 bg-gradient-to-tr from-[#fd5949] via-[#d6249f] to-[#285aeb] text-white hover:scale-110 transition-transform shadow-lg shadow-black/40"
          >
            <FaInstagram className="w-5 h-5" />
          </a>
          <span className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-3 bg-card text-foreground text-xs font-semibold px-3 py-1.5 whitespace-nowrap opacity-0 translate-x-1 group-hover:translate-x-0 group-hover:opacity-100 transition-all hidden sm:block">
            Follow us
          </span>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="bg-background border-t border-border/10 py-10 px-5 sm:px-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <img
            src="/logo.png"
            alt="Padel Mania"
            className="h-10 w-auto opacity-60"
          />
          <p className="text-foreground/30 text-xs text-center">
            &copy; 2026 Padel Mania. All rights reserved.
          </p>
          <p className="text-foreground/30 text-xs">
            Powered by{" "}
            <a
              href="https://www.finsense.co.ke/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors font-semibold"
            >
              FinSense Africa
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default CommingSoon;
