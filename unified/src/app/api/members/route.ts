import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('gym_id').eq('id', user.id).single()
  if (!profile?.gym_id) return NextResponse.json({ error: 'No gym' }, { status: 400 })

  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status')
  const risk = searchParams.get('risk') // 'high', 'medium', 'low'
  const limit = parseInt(searchParams.get('limit') || '50')

  let query = supabase
    .from('members')
    .select('*')
    .eq('gym_id', profile.gym_id)
    .order('risk_score', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  if (risk === 'high') query = query.gte('risk_score', 61)
  else if (risk === 'medium') query = query.gte('risk_score', 31).lt('risk_score', 61)
  else if (risk === 'low') query = query.lt('risk_score', 31)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('gym_id').eq('id', user.id).single()
  if (!profile?.gym_id) return NextResponse.json({ error: 'No gym' }, { status: 400 })

  const body = await request.json()

  const { data, error } = await supabase
    .from('members')
    .insert({ ...body, gym_id: profile.gym_id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data }, { status: 201 })
}
