'use client'

import { useState } from 'react'
import { User, Mail, Phone, Building, Users, ArrowRight, Loader2 } from 'lucide-react'
import { API_URL } from '../lib/api'

interface FormData {
  name: string
  email: string
  phone: string
  gymName: string
  memberCount: string
}

interface AuditLeadFormProps {
  onSuccess: () => void
}

export default function AuditLeadForm({ onSuccess }: AuditLeadFormProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    gymName: '',
    memberCount: ''
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Partial<FormData>>({})

  const validateForm = (): boolean => {
    const newErrors: Partial<FormData> = {}

    if (!formData.name.trim()) newErrors.name = 'Full name is required'
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }
    if (!formData.gymName.trim()) newErrors.gymName = 'Gym name is required'
    if (!formData.memberCount.trim()) {
      newErrors.memberCount = 'Number of members is required'
    } else if (isNaN(Number(formData.memberCount)) || Number(formData.memberCount) <= 0) {
      newErrors.memberCount = 'Please enter a valid number of members'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsSubmitting(true)

    try {
      const response = await fetch(`${API_URL}/leads/audit-signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone || undefined,
          gymName: formData.gymName,
          memberCount: Number(formData.memberCount)
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to submit form')
      }

      // Success - trigger parent callback to show file upload
      onSuccess()

    } catch (error) {
      console.error('Form submission error:', error)
      setErrors({ email: 'Something went wrong. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  return (
    <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200">
      <div className="text-center mb-8">
        <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <Building className="text-primary" size={32} />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Tell Us About Your Gym
        </h2>
        <p className="text-gray-600">
          Get your personalized revenue audit in just 2 minutes
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User size={16} className="inline mr-2" />
              Full Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={handleChange('name')}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-colors ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Your full name"
              disabled={isSubmitting}
            />
            {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Mail size={16} className="inline mr-2" />
              Email Address *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={handleChange('email')}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-colors ${
                errors.email ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="your@email.com"
              disabled={isSubmitting}
            />
            {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Phone (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Phone size={16} className="inline mr-2" />
              Phone Number
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={handleChange('phone')}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
              placeholder="Optional"
              disabled={isSubmitting}
            />
          </div>

          {/* Number of Members */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Users size={16} className="inline mr-2" />
              Number of Members *
            </label>
            <input
              type="number"
              value={formData.memberCount}
              onChange={handleChange('memberCount')}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-colors ${
                errors.memberCount ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="e.g. 500"
              min="1"
              disabled={isSubmitting}
            />
            {errors.memberCount && <p className="text-red-600 text-sm mt-1">{errors.memberCount}</p>}
          </div>
        </div>

        {/* Gym Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Building size={16} className="inline mr-2" />
            Gym Name *
          </label>
          <input
            type="text"
            value={formData.gymName}
            onChange={handleChange('gymName')}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-colors ${
              errors.gymName ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="Your gym or fitness business name"
            disabled={isSubmitting}
          />
          {errors.gymName && <p className="text-red-600 text-sm mt-1">{errors.gymName}</p>}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-primary text-white py-4 px-6 rounded-lg font-bold text-lg hover:bg-blue-700 transition-all duration-300 shadow-xl hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              Processing...
            </>
          ) : (
            <>
              Get My Revenue Audit
              <ArrowRight size={20} />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-gray-500">
        <p>We'll analyze your data securely and never store personal member information.</p>
      </div>
    </div>
  )
}