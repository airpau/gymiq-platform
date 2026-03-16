import Link from 'next/link'
import {
  CheckCircle,
  Shield,
  MessageSquare,
  Crown,
  Users,
  Zap,
  BarChart3,
  PhoneCall,
  Mail,
  Clock,
  Star,
  ArrowRight
} from 'lucide-react'
import Navbar from '@/components/Navbar'

export default function PricingPage() {
  const faqs = [
    {
      question: 'How does GymIQ connect to my gym system?',
      answer: 'GymIQ integrates with all major gym management platforms including GloFox, Mindbody, ClubRight, and many others. If your system isn\'t directly supported, you can upload CSV exports on a schedule.'
    },
    {
      question: 'Is my member data safe?',
      answer: 'Absolutely. We use bank-level encryption and comply with GDPR regulations. Your member data is processed securely and we never share it with third parties. You maintain full control over your data at all times.'
    },
    {
      question: 'How long before I see results?',
      answer: 'Most gyms see their first saved cancellations within 48 hours of setup. Lead response improvements are immediate. Full ROI typically shows within 30-60 days as the AI learns your member patterns.'
    },
    {
      question: 'Can I try before I buy?',
      answer: 'Yes! Start with our free revenue audit to see exactly how much you\'re losing. Then choose a 14-day free trial of any plan. No credit card required for the audit, and you can cancel anytime during the trial.'
    },
    {
      question: 'What happens if I cancel?',
      answer: 'You can cancel anytime with 30 days notice. Your data is exported securely and deleted from our systems. We don\'t believe in long-term contracts - our AI should earn its place in your gym every month.'
    },
    {
      question: 'Do you support multi-site gyms?',
      answer: 'Yes! Our Enterprise plan is designed for gym chains and franchises. Get centralized analytics across all locations with site-specific AI personalities and reporting. Contact us for custom pricing.'
    },
    {
      question: 'What happens if I exceed my usage limits?',
      answer: 'Each plan includes generous usage caps (WhatsApp messages, AI conversations, members/leads). If you exceed these limits, you will be billed for overage at £0.05 per additional WhatsApp message and £0.02 per additional AI conversation. We will notify you when you are approaching your limits, and you can upgrade your plan anytime to avoid overage charges.'
    }
  ]

  return (
    <main className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">
              Simple, Transparent Pricing
            </h1>
            <p className="text-xl text-gray-600">
              No setup fees. No contracts. Cancel anytime.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid lg:grid-cols-3 gap-8 mb-16">
            {/* Retention AI */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300">
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-primary/10 p-2 rounded-lg">
                    <Shield className="text-primary" size={24} />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">Retention AI</h3>
                </div>

                <div className="mb-6">
                  <span className="text-5xl font-bold text-gray-900">£179</span>
                  <span className="text-gray-600">/month</span>
                </div>

                <p className="text-gray-600 mb-6">
                  Perfect for gyms focused on keeping existing members engaged and reducing churn.
                </p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">Churn prediction for all members</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">Automated sleeper detection</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">Cancel-save AI conversations</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">Payment recovery sequences</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">Risk dashboard</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">Email + WhatsApp channels</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">Up to 4,000 members</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">500 WhatsApp messages/month</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">200 AI conversations/month</span>
                </div>
              </div>

              <Link
                href="/audit"
                className="block w-full bg-primary text-white text-center px-6 py-4 rounded-lg font-bold hover:bg-blue-700 transition-colors duration-200"
              >
                Start Free Trial
              </Link>
            </div>

            {/* Lead Recovery AI */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300">
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-secondary/10 p-2 rounded-lg">
                    <MessageSquare className="text-secondary" size={24} />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">Lead Recovery AI</h3>
                </div>

                <div className="mb-6">
                  <span className="text-5xl font-bold text-gray-900">£179</span>
                  <span className="text-gray-600">/month</span>
                </div>

                <p className="text-gray-600 mb-6">
                  Ideal for growing gyms that want to maximize every lead opportunity.
                </p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">AI lead nurturing (WhatsApp, Email, SMS)</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">30-second response time</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">5-touch follow-up sequence</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">Automated tour booking</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">Post-visit conversion tracking</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">Lead pipeline dashboard</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">Up to 500 leads/month</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">1,000 WhatsApp messages/month</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700">300 AI conversations/month</span>
                </div>
              </div>

              <Link
                href="/audit"
                className="block w-full bg-primary text-white text-center px-6 py-4 rounded-lg font-bold hover:bg-blue-700 transition-colors duration-200"
              >
                Start Free Trial
              </Link>
            </div>

            {/* GymIQ Complete */}
            <div className="bg-white rounded-2xl p-8 shadow-xl border-2 border-primary relative hover:shadow-2xl transition-all duration-300">
              {/* Popular Badge */}
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <div className="bg-primary text-white px-6 py-2 rounded-full text-sm font-bold flex items-center gap-2">
                  <Star className="fill-current" size={16} />
                  POPULAR
                </div>
              </div>

              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-primary/10 p-2 rounded-lg">
                    <Crown className="text-primary" size={24} />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">GymIQ Complete</h3>
                </div>

                <div className="mb-2">
                  <span className="text-5xl font-bold text-gray-900">£299</span>
                  <span className="text-gray-600">/month</span>
                </div>

                <div className="bg-secondary/10 text-secondary px-3 py-1 rounded-full text-sm font-bold inline-block mb-6">
                  Save £59/month
                </div>

                <p className="text-gray-600 mb-6">
                  The complete revenue protection system for serious gym operators.
                </p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700 font-medium">Everything in Retention AI</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="text-secondary mt-0.5" size={20} />
                  <span className="text-gray-700 font-medium">Everything in Lead Recovery AI</span>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Crown className="text-primary mt-0.5" size={20} />
                    <span className="text-gray-700">Priority support</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Crown className="text-primary mt-0.5" size={20} />
                    <span className="text-gray-700">Custom AI personality</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Crown className="text-primary mt-0.5" size={20} />
                    <span className="text-gray-700">Advanced analytics</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Crown className="text-primary mt-0.5" size={20} />
                    <span className="text-gray-700">Up to 4,000 members & unlimited leads</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Crown className="text-primary mt-0.5" size={20} />
                    <span className="text-gray-700">1,500 WhatsApp messages/month</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Crown className="text-primary mt-0.5" size={20} />
                    <span className="text-gray-700">500 AI conversations/month</span>
                  </div>
                </div>
              </div>

              <Link
                href="/audit"
                className="block w-full bg-primary text-white text-center px-6 py-4 rounded-lg font-bold hover:bg-blue-700 transition-colors duration-200 shadow-lg hover:shadow-xl"
              >
                Start Free Trial
              </Link>
            </div>
          </div>

          {/* Enterprise */}
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-2xl p-12 text-center mb-16">
            <div className="max-w-3xl mx-auto">
              <h3 className="text-3xl font-bold mb-4">4,000+ members? Multi-site? Custom needs?</h3>
              <p className="text-xl text-gray-300 mb-8">
                Gyms with over 4,000 members need enterprise pricing tailored to usage. 
                Also available for gym chains, franchises, and custom integrations.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Link
                  href="#"
                  className="bg-white text-gray-900 px-8 py-4 rounded-lg font-bold hover:bg-gray-100 transition-colors flex items-center gap-2"
                >
                  Talk to Us
                  <ArrowRight size={20} />
                </Link>
                <div className="flex items-center gap-4 text-gray-300">
                  <div className="flex items-center gap-2">
                    <Users size={20} />
                    <span>Multi-site management</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <PhoneCall size={20} />
                    <span>Dedicated support</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-bold text-gray-900 text-center mb-12">
              Frequently Asked Questions
            </h2>

            <div className="space-y-8">
              {faqs.map((faq, index) => (
                <div key={index} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">{faq.question}</h3>
                  <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="bg-primary text-white rounded-2xl p-12 text-center mt-16">
            <h3 className="text-3xl font-bold mb-4">Ready to Stop Losing Revenue?</h3>
            <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
              Start with a free audit to see exactly how much you're losing, then choose the plan that's right for your gym.
            </p>
            <Link
              href="/audit"
              className="inline-flex items-center gap-3 bg-secondary text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-green-600 transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-105"
            >
              Get Your Free Audit
              <ArrowRight size={24} />
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}