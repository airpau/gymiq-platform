import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('gym_id').eq('id', user.id).single()
  if (!profile?.gym_id) return NextResponse.json({ error: 'No gym' }, { status: 400 })

  const stage = request.nextUrl.searchParams.get('stage')

  let query = supabase
    .from('leads')
    .select('*')
    .eq('gym_id', profile.gym_id)
    .order('score', { ascending: false })

  if (stage) query = query.eq('current_stage', stage)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('gym_id').eq('id', user.id).single()
  if (!profile?.gym_id) return NextResponse.json({ error: 'No gym' }, { status: 400 })

  const body = await request.json()

  const { data, error } = await supabase
    .from('leads')
    .insert({ ...body, gym_id: profile.gym_id, current_stage: 'new' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data }, { status: 201 })
}
