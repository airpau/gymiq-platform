'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Shield,
  Zap,
  BarChart3,
  Users,
  MessageSquare,
  Clock,
  CheckCircle,
  Star,
  ArrowRight,
  TrendingUp,
  Target,
  PhoneCall
} from 'lucide-react'
import Navbar from '@/components/Navbar'

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-blue-600 to-purple-700 text-white overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_70%)]"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="animate-fade-in-up">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              Stop Losing Members.
              <br />
              <span className="text-yellow-300">Start Growing Revenue.</span>
            </h1>

            <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto leading-relaxed text-blue-100">
              GymIQ uses AI to predict which members are about to leave, save cancellations,
              and convert more leads — all on autopilot.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
              <Link
                href="/audit"
                className="bg-secondary text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-green-600 transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-105 flex items-center gap-2"
              >
                Get Your Free Revenue Audit
                <ArrowRight size={20} />
              </Link>

              <Link
                href="#demo"
                className="border-2 border-white text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white hover:text-primary transition-all duration-300 shadow-xl hover:shadow-2xl"
              >
                See How It Works
              </Link>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto text-center">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
                <div className="text-3xl font-bold text-yellow-300">£2,494</div>
                <div className="text-sm text-blue-100">avg revenue at risk per gym</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
                <div className="text-3xl font-bold text-yellow-300">72%</div>
                <div className="text-sm text-blue-100">save rate on cancellations</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
                <div className="text-3xl font-bold text-yellow-300">3x</div>
                <div className="text-sm text-blue-100">faster lead response</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              The Hidden Revenue Leak in Every Gym
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Your gym is bleeding money in ways you can't see. Here's how much revenue
              walks out the door every month.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200 hover:shadow-xl transition-shadow duration-300">
              <div className="bg-danger/10 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <Users className="text-danger" size={32} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Silent Leavers</h3>
              <p className="text-gray-600 leading-relaxed">
                Members stop coming but keep paying... until they cancel. By then it's too late.
                You lose 3-6 months of revenue per ghost member.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200 hover:shadow-xl transition-shadow duration-300">
              <div className="bg-accent/10 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <PhoneCall className="text-accent" size={32} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Missed Leads</h3>
              <p className="text-gray-600 leading-relaxed">
                40% of gym leads never get a follow-up. That's money walking out the door.
                Every missed lead is £600+ in lifetime value lost forever.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200 hover:shadow-xl transition-shadow duration-300">
              <div className="bg-gray-400/10 w-16 h-16 rounded-full flex items-center justify-center mb-6">
                <Clock className="text-gray-600" size={32} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Manual Everything</h3>
              <p className="text-gray-600 leading-relaxed">
                Your team is busy. Follow-ups fall through cracks. Cancellations slip past.
                Manual processes cost you 20-30% of potential revenue.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section id="product" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              GymIQ: Your AI-Powered Revenue Protection System
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Stop the leaks. Protect your revenue. Grow your gym with AI that works 24/7
              to keep members engaged and convert more leads.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Shield className="text-primary" size={40} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Retention AI</h3>
              <ul className="text-gray-600 space-y-2 text-left">
                <li className="flex items-start gap-2">
                  <CheckCircle className="text-secondary mt-0.5" size={16} />
                  <span>Predicts churn 30 days before it happens</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="text-secondary mt-0.5" size={16} />
                  <span>Automated recovery campaigns for at-risk members</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="text-secondary mt-0.5" size={16} />
                  <span>Cancel-save AI that talks members out of leaving</span>
                </li>
              </ul>
            </div>

            <div className="text-center">
              <div className="bg-secondary/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <MessageSquare className="text-secondary" size={40} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Lead Recovery AI</h3>
              <ul className="text-gray-600 space-y-2 text-left">
                <li className="flex items-start gap-2">
                  <CheckCircle className="text-secondary mt-0.5" size={16} />
                  <span>Responds to new leads in under 30 seconds via WhatsApp</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="text-secondary mt-0.5" size={16} />
                  <span>5-touch AI nurture sequence</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="text-secondary mt-0.5" size={16} />
                  <span>Books tours and follows up automatically</span>
                </li>
              </ul>
            </div>

            <div className="text-center">
              <div className="bg-accent/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <BarChart3 className="text-accent" size={40} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Smart Dashboard</h3>
              <ul className="text-gray-600 space-y-2 text-left">
                <li className="flex items-start gap-2">
                  <CheckCircle className="text-secondary mt-0.5" size={16} />
                  <span>Real-time risk scoring for every member</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="text-secondary mt-0.5" size={16} />
                  <span>Revenue at risk tracker</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="text-secondary mt-0.5" size={16} />
                  <span>Lead pipeline with conversion analytics</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="demo" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              How It Works
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Get up and running in minutes. GymIQ integrates with your existing system
              and starts protecting revenue immediately.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                step: "1",
                title: "Connect Your System",
                description: "Link your gym management system (GloFox, Mindbody, ClubRight, or upload CSV)",
                icon: <Zap size={32} />
              },
              {
                step: "2",
                title: "AI Analysis",
                description: "GymIQ analyses your member data and identifies at-risk revenue in real-time",
                icon: <Target size={32} />
              },
              {
                step: "3",
                title: "Auto-Engagement",
                description: "AI automatically engages at-risk members and nurtures new leads via WhatsApp & email",
                icon: <MessageSquare size={32} />
              },
              {
                step: "4",
                title: "Watch Revenue Grow",
                description: "Monitor your retention improve and leads convert through the smart dashboard",
                icon: <TrendingUp size={32} />
              }
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="bg-primary text-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                  {item.step}
                </div>
                <div className="bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <div className="text-primary">{item.icon}</div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">{item.title}</h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Trusted by Forward-Thinking Gyms
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                gym: "Energie Fitness Hoddesdon",
                quote: "GymIQ saved us 23 members last month alone. That's over £736 in monthly revenue we would have lost. The ROI is incredible.",
                author: "Sarah M., Manager"
              },
              {
                gym: "CrossFit Thames",
                quote: "Our lead conversion rate went from 12% to 31% in 6 weeks. The AI follows up faster than any human could. Game changer.",
                author: "James K., Owner"
              },
              {
                gym: "FitSpace Manchester",
                quote: "I was sceptical about AI, but GymIQ spotted 8 high-risk members I had no idea were thinking of leaving. Saved them all.",
                author: "Lisa T., Operations Director"
              }
            ].map((testimonial, index) => (
              <div key={index} className="bg-gray-50 rounded-2xl p-8 border border-gray-200">
                <div className="flex mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="text-yellow-400 fill-current" size={20} />
                  ))}
                </div>
                <p className="text-gray-700 mb-6 italic leading-relaxed">
                  "{testimonial.quote}"
                </p>
                <div>
                  <div className="font-bold text-gray-900">{testimonial.gym}</div>
                  <div className="text-gray-600 text-sm">{testimonial.author}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Waitlist Section */}
      <WaitlistSection />

      {/* ROI Calculator Section */}
      <ROICalculator />

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-r from-primary to-blue-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            See Exactly How Much Revenue You're Losing
          </h2>
          <p className="text-xl mb-8 text-blue-100">
            Upload your membership export and get a free AI-powered audit in 60 seconds
          </p>
          <Link
            href="/audit"
            className="inline-flex items-center gap-3 bg-secondary text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-green-600 transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-105"
          >
            Start Free Audit
            <ArrowRight size={24} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="bg-primary text-white rounded-lg p-2 font-bold text-lg">
                  GI
                </div>
                <span className="font-bold text-xl">GymIQ</span>
              </div>
              <p className="text-gray-400 mb-4">
                Built with AI. Designed for gyms.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-lg mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/#product" className="hover:text-white transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="/audit" className="hover:text-white transition-colors">Free Audit</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-lg mb-4">Support</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="#" className="hover:text-white transition-colors">Help Centre</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Contact Us</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Book Demo</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-lg mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Data Processing</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400">
            <p>&copy; 2026 GymIQ. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  )
}

// Waitlist Component
function WaitlistSection() {
  const [formData, setFormData] = useState({ email: '', gymName: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('https://gymiq-api-production.up.railway.app/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          gymName: formData.gymName,
          source: 'waitlist',
          type: 'waitlist'
        }),
      });

      if (response.ok) {
        setIsSuccess(true);
        setFormData({ email: '', gymName: '' });
      } else {
        throw new Error('Failed to join waitlist');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <section className="py-24 bg-gradient-to-br from-green-50 to-blue-50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-white rounded-2xl p-12 shadow-lg border border-green-200">
            <div className="text-6xl mb-6">🎉</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">You're on the list!</h2>
            <p className="text-xl text-gray-600 mb-8">
              We'll be in touch soon with early access to GymIQ and exclusive launch pricing.
            </p>
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <p className="text-green-700 font-medium">
                💡 Want faster access? <a href="mailto:paul@gymiq.ai" className="underline">Book a demo</a> and get started today.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-24 bg-gradient-to-br from-primary/5 to-blue-100/30">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="bg-white rounded-2xl p-12 shadow-lg border border-gray-200">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Be first to transform your gym
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join hundreds of gym owners getting early access to GymIQ.
            Be the first to stop losing members and start growing revenue with AI.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <input
                  type="email"
                  placeholder="Your email address"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-6 py-4 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Your gym name"
                  required
                  value={formData.gymName}
                  onChange={(e) => setFormData({ ...formData, gymName: e.target.value })}
                  className="w-full px-6 py-4 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-blue-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Joining waitlist...
                </span>
              ) : (
                'Join the Waitlist'
              )}
            </button>

            <div className="flex items-center justify-center space-x-4 text-sm text-gray-500 mt-6">
              <div className="flex items-center gap-1">
                <CheckCircle size={16} className="text-green-500" />
                <span>No spam, ever</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle size={16} className="text-green-500" />
                <span>Exclusive launch pricing</span>
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle size={16} className="text-green-500" />
                <span>Early access</span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

// ROI Calculator Component
function ROICalculator() {
  return (
    <section className="py-24 bg-slate-900 text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Calculate Your ROI
          </h2>
          <p className="text-xl text-slate-300">
            See how much revenue GymIQ could save your gym every month
          </p>
        </div>

        <div className="bg-white rounded-2xl p-8 text-gray-900">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Inputs */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Number of Members</label>
                <input
                  type="range"
                  min="200"
                  max="3000"
                  defaultValue="1000"
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                  id="members"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-1">
                  <span>200</span>
                  <span id="membersValue">1,000</span>
                  <span>3,000</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Average Monthly Fee</label>
                <input
                  type="range"
                  min="20"
                  max="60"
                  defaultValue="32"
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                  id="fee"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-1">
                  <span>£20</span>
                  <span id="feeValue">£32</span>
                  <span>£60</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Monthly Churn Rate</label>
                <input
                  type="range"
                  min="2"
                  max="10"
                  defaultValue="5"
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                  id="churn"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-1">
                  <span>2%</span>
                  <span id="churnValue">5%</span>
                  <span>10%</span>
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600">Members at risk of leaving</div>
                <div className="text-2xl font-bold text-danger" id="atRisk">50</div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600">Monthly revenue at risk</div>
                <div className="text-2xl font-bold text-danger" id="revenueAtRisk">£1,600</div>
              </div>

              <div className="bg-secondary/10 rounded-lg p-4 border border-secondary">
                <div className="text-sm text-secondary">With GymIQ (70% save rate)</div>
                <div className="text-2xl font-bold text-secondary" id="saved">£1,120 saved per month</div>
              </div>

              <div className="bg-primary/10 rounded-lg p-4 border border-primary">
                <div className="text-sm text-primary">Annual ROI</div>
                <div className="text-2xl font-bold text-primary" id="roi">7.5:1</div>
              </div>

              <Link
                href="/audit"
                className="block w-full bg-primary text-white text-center px-6 py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors"
              >
                Upload your data for exact numbers →
              </Link>
            </div>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{
        __html: `
          function updateCalculator() {
            const members = document.getElementById('members').value;
            const fee = document.getElementById('fee').value;
            const churn = document.getElementById('churn').value;

            document.getElementById('membersValue').textContent = members.toLocaleString();
            document.getElementById('feeValue').textContent = '£' + fee;
            document.getElementById('churnValue').textContent = churn + '%';

            const atRisk = Math.round(members * churn / 100);
            const revenueAtRisk = atRisk * fee;
            const saved = Math.round(revenueAtRisk * 0.7);
            const annualSavings = saved * 12;
            const roi = (annualSavings / (149 * 12)).toFixed(1);

            document.getElementById('atRisk').textContent = atRisk;
            document.getElementById('revenueAtRisk').textContent = '£' + revenueAtRisk.toLocaleString();
            document.getElementById('saved').textContent = '£' + saved.toLocaleString() + ' saved per month';
            document.getElementById('roi').textContent = roi + ':1';
          }

          document.getElementById('members').addEventListener('input', updateCalculator);
          document.getElementById('fee').addEventListener('input', updateCalculator);
          document.getElementById('churn').addEventListener('input', updateCalculator);
        `
      }} />
    </section>
  )
}