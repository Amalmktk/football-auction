export type BiddingMode = 'auctioneer' | 'captain'
export type PlayerOrder = 'manual' | 'category' | 'random'
export type Position = 'GK' | 'DEF' | 'MID' | 'FWD'
export type PlayerStatus = 'available' | 'on_block' | 'sold' | 'unsold'
export type AuctionStatus = 'idle' | 'bidding' | 'sold' | 'unsold' | 'paused' | 'finished'

export interface Increment {
  upto: number | null
  step: number
}

export interface Settings {
  id: 1
  tournament_name: string
  starting_purse: number
  min_squad: number
  max_squad: number | null // null = no maximum
  bid_timer_seconds: number
  mode: BiddingMode
  increments: Increment[]
  player_order: PlayerOrder
}

export interface Team {
  id: string
  name: string
  short_name: string
  color: string
  logo_url: string | null
  captain_name: string | null
  purse_remaining: number
}

export interface Player {
  id: string
  name: string
  department: string | null
  position: Position | null
  rating: number | null
  category: string | null
  base_price: number
  photo_url: string | null
  is_captain: boolean
  status: PlayerStatus
  team_id: string | null
  sold_price: number | null
  auction_order: number | null
  sold_at: string | null
}

export interface AuctionState {
  id: 1
  status: AuctionStatus
  round: 'main' | 'reauction'
  current_player_id: string | null
  current_bid: number | null
  leading_team_id: string | null
  timer_ends_at: string | null
  updated_at: string
  paused_status: AuctionStatus | null
  paused_remaining_ms: number | null
}

export interface Bid {
  id: number
  player_id: string
  team_id: string
  amount: number
  placed_by: string | null
  undone: boolean
  created_at: string
}

export const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD']
