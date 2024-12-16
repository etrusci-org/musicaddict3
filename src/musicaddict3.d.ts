type worker_message_data = {
    cmd:
        'init_game' | 'init_market'
        | 'play'
        | 'pause'
        | 'plan_next_game_loop_tick'
        | 'plan_next_ui_loop_tick'
        | 'plan_next_save_loop_tick'
        | 'plan_next_authrefresh_loop_tick'
        | 'plan_next_activeplayers_loop_tick'
        | 'game_loop_tick'
        | 'ui_loop_tick'
        | 'save_loop_tick'
        | 'authrefresh_loop_tick'
        | 'activeplayers_loop_tick'
    payload: {
        [key: string]: any
    }
}

type record = {
    title: string
    artist: string
    year: number
    style: string
    format: string
    id: string
    buy_price: record_buy_price
    sell_price: record_sell_price
}

type record_buy_price = {
    amount: number
    tier: price_tier
}

type record_sell_price = {
    amount: number
}

type price_tier = {
    tier_level: number
    tier_name: string
    roll_max: number
    min_cash: number
    range: number_range
}

type price_tier_ranges = price_tier[]

type reputation_gains = {
    buy_record: number
    sell_record: number
    upgrade_storage: number
}

type number_range = {
    min: number
    max: number
}

type user_session = {
    is_logged_in: boolean
    id: string
    save_id: string
    name: string
}

type coverart_buffer = {
    [key: string]: string
}

type save_data = {
    // keepers
    data_version: number
    theme: 'dark' | 'light'
    cash: number
    records: record[]
    collection_worth: number_range
    records_listened: number
    records_liked: number
    records_disliked: number
    trade_income: number
    trade_expenses: number
    trade_profit: number
    trade_offers_accepted: number
    trade_offers_declined: number
    records_sold: number
    records_bought: number
    reputation: number
    storage_size: number
    buy_chance: number
    sell_chance: number
    game_started_on: number
    next_progress_action: string
    buy_record: record
    sell_record: record
    sell_record_key: number
    incoming_offer: boolean
    started_listening_on: number
    listen_duration: number
    // reset these on init
    session_started_on: number
    autosaved_on: number
    last_offer_on: number
    next_offer_in: number
}
