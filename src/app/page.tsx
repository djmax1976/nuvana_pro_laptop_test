"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ContactForm } from "@/components/homepage/ContactForm";
import {
  Package,
  Clock,
  Ticket,
  DollarSign,
  CheckCircle2,
  ArrowRight,
  Zap,
  Shield,
  BarChart3,
  Bot,
  Building2,
} from "lucide-react";

// Disable static optimization for this page
export const dynamic = "force-dynamic";

export default function Home() {
  const [isVisible, setIsVisible] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const painPointsRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsVisible(true);

    const observerOptions = {
      threshold: 0.1,
      rootMargin: "0px 0px -100px 0px",
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("animate-in");
        }
      });
    }, observerOptions);

    const refs = [painPointsRef, contactRef];
    refs.forEach((ref) => {
      if (ref.current) {
        observer.observe(ref.current);
      }
    });

    return () => {
      refs.forEach((ref) => {
        if (ref.current) {
          observer.unobserve(ref.current);
        }
      });
    };
  }, []);

  const scrollToContact = () => {
    contactRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="flex min-h-screen flex-col bg-background">
      {/* Hero Section - Split Layout */}
      <section
        ref={heroRef}
        className="relative overflow-hidden min-h-[90vh] flex items-center"
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Text Content */}
            <div
              className={`space-y-8 transition-all duration-1000 ${
                isVisible
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 -translate-x-10"
              }`}
            >
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
                <span className="block text-foreground mb-2">
                  Effortless Store Management
                </span>
                <span className="block bg-gradient-to-r from-[#667EEA] to-[#764BA2] bg-clip-text text-transparent">
                  Made Simple
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-xl leading-relaxed">
                Nuvana Pro is an enterprise-grade, multi-tenant platform
                designed for convenience stores, fuel retailers, and multi-store
                operators. Streamline operations, reduce errors, and gain
                real-time insights with AI-powered tools built for scale.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={scrollToContact}
                  size="lg"
                  className="bg-gradient-to-r from-[#667EEA] to-[#764BA2] hover:from-[#5568D3] hover:to-[#653A8F] text-white shadow-lg hover:shadow-xl transition-all duration-300 text-base px-8"
                >
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="text-base px-8 border-2"
                >
                  <Link href="/dashboard">View Dashboard</Link>
                </Button>
              </div>
            </div>

            {/* Right: Visual Element */}
            <div
              className={`relative transition-all duration-1000 delay-300 ${
                isVisible
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 translate-x-10"
              }`}
            >
              <div className="relative bg-gradient-to-br from-[#667EEA]/10 to-[#764BA2]/10 rounded-2xl p-8 border border-[#667EEA]/20 shadow-2xl transform hover:scale-105 transition-transform duration-500">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-background rounded-lg p-4 shadow-md">
                    <Zap className="h-8 w-8 text-[#667EEA] mb-2" />
                    <p className="text-sm font-semibold">Real-Time Sync</p>
                  </div>
                  <div className="bg-background rounded-lg p-4 shadow-md">
                    <Shield className="h-8 w-8 text-[#764BA2] mb-2" />
                    <p className="text-sm font-semibold">Enterprise Security</p>
                  </div>
                  <div className="bg-background rounded-lg p-4 shadow-md">
                    <BarChart3 className="h-8 w-8 text-[#667EEA] mb-2" />
                    <p className="text-sm font-semibold">Advanced Analytics</p>
                  </div>
                  <div className="bg-background rounded-lg p-4 shadow-md">
                    <Bot className="h-8 w-8 text-[#764BA2] mb-2" />
                    <p className="text-sm font-semibold">AI-Powered</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points Section */}
      <section ref={painPointsRef} className="py-24 bg-muted/30 relative">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-foreground">
              Your Pain Points,{" "}
              <span className="bg-gradient-to-r from-[#667EEA] to-[#764BA2] bg-clip-text text-transparent">
                Solved
              </span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Stop struggling with manual processes and disconnected systems.
              Nuvana Pro addresses your biggest operational challenges.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Pain Point 1: Inventory Management */}
            <div className="group relative bg-card rounded-xl p-8 border border-border shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 hover:rotate-1">
              <div className="absolute inset-0 bg-gradient-to-br from-[#667EEA]/5 to-[#764BA2]/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-[#667EEA] to-[#764BA2] shadow-md">
                  <Package className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-card-foreground">
                  Effortless Inventory Management
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Automate stock tracking, purchase orders, and vendor
                  management. Get real-time inventory levels across all stores
                  with automatic reconciliation and variance detection.
                </p>
              </div>
            </div>

            {/* Pain Point 2: Shift Reconciliation */}
            <div className="group relative bg-card rounded-xl p-8 border border-border shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 hover:-rotate-1">
              <div className="absolute inset-0 bg-gradient-to-br from-[#667EEA]/5 to-[#764BA2]/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-[#667EEA] to-[#764BA2] shadow-md">
                  <Clock className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-card-foreground">
                  Effortless Shift & Day Reconciliations
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Streamline shift opening and closing with automatic cash
                  reconciliation. Detect variances instantly and maintain
                  complete audit trails for compliance and accountability.
                </p>
              </div>
            </div>

            {/* Pain Point 3: Lottery Tracking */}
            <div className="group relative bg-card rounded-xl p-8 border border-border shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 hover:rotate-1">
              <div className="absolute inset-0 bg-gradient-to-br from-[#667EEA]/5 to-[#764BA2]/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-[#667EEA] to-[#764BA2] shadow-md">
                  <Ticket className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-card-foreground">
                  Effortless Lottery Tracking
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Track every scratch-off ticket at the serial level. Automatic
                  shift reconciliation detects missing or extra tickets
                  instantly, eliminating manual counting errors and reducing
                  losses.
                </p>
              </div>
            </div>

            {/* Pain Point 4: Price Updates */}
            <div className="group relative bg-card rounded-xl p-8 border border-border shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 hover:-rotate-1">
              <div className="absolute inset-0 bg-gradient-to-br from-[#667EEA]/5 to-[#764BA2]/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-[#667EEA] to-[#764BA2] shadow-md">
                  <DollarSign className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-card-foreground">
                  Effortless Price Updates
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Update prices across multiple stores instantly. Bulk price
                  management with automatic POS synchronization ensures
                  consistency and eliminates pricing errors.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Building / Benefits Section */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-foreground">
                Enterprise-Grade Platform
                <span className="block mt-2 bg-gradient-to-r from-[#667EEA] to-[#764BA2] bg-clip-text text-transparent">
                  Built for Scale
                </span>
              </h2>
              <p className="text-lg text-muted-foreground">
                Trusted by multi-store operators who demand reliability,
                security, and performance.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <div className="flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-[#00C853] flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold mb-2 text-foreground">
                    AI-Powered Operations
                  </h3>
                  <p className="text-muted-foreground">
                    Built-in AI assistant generates reports, processes invoice
                    OCR, and provides intelligent reconciliation suggestions.
                    Ask questions in natural language and get instant insights.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-[#00C853] flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold mb-2 text-foreground">
                    Multi-Tenant Architecture
                  </h3>
                  <p className="text-muted-foreground">
                    Manage unlimited companies and stores with complete data
                    isolation. Role-based access control ensures users only see
                    what they need, when they need it.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-[#00C853] flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold mb-2 text-foreground">
                    High Performance
                  </h3>
                  <p className="text-muted-foreground">
                    Support 1000+ concurrent users and process 100,000+
                    transactions per day per store. Sub-500ms API response times
                    ensure your team never waits.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-[#00C853] flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold mb-2 text-foreground">
                    PCI DSS Compliant
                  </h3>
                  <p className="text-muted-foreground">
                    Enterprise security with comprehensive audit trails,
                    role-based permissions, and industry-leading compliance
                    standards. Your data is protected at every level.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-[#00C853] flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold mb-2 text-foreground">
                    99.9% Uptime Guarantee
                  </h3>
                  <p className="text-muted-foreground">
                    Reliable infrastructure with horizontal scaling, automatic
                    failover, and multi-zone deployment. Your operations never
                    stop.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-[#00C853] flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-xl font-bold mb-2 text-foreground">
                    Comprehensive Reporting
                  </h3>
                  <p className="text-muted-foreground">
                    Shift reports, daily summaries, P&L calculations, and
                    multi-store analytics. Export to CSV or PDF. Recalculation
                    engine handles late invoices automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Key Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12 pt-12 border-t border-border">
              <div className="text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-[#667EEA] to-[#764BA2] bg-clip-text text-transparent">
                  1000+
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Concurrent Users
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-[#667EEA] to-[#764BA2] bg-clip-text text-transparent">
                  100K+
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Transactions/Day
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-[#667EEA] to-[#764BA2] bg-clip-text text-transparent">
                  99.9%
                </div>
                <div className="text-sm text-muted-foreground mt-1">Uptime</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-[#667EEA] to-[#764BA2] bg-clip-text text-transparent">
                  &lt;500ms
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  API Response
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section
        ref={contactRef}
        className="py-24 bg-gradient-to-br from-muted/50 to-background relative"
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto">
            <div className="bg-card rounded-2xl p-8 md:p-12 shadow-2xl border border-border">
              <div className="text-center mb-8">
                <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-foreground">
                  Ready to Transform Your Operations?
                </h2>
                <p className="text-lg text-muted-foreground">
                  Get in touch and let&apos;s discuss how Nuvana Pro can
                  streamline your store management.
                </p>
              </div>
              <ContactForm />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
