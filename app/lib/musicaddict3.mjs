import { MusicAddict3_Data } from './musicaddict3.data.v3.mjs';
import PocketBase from './vendor/pocketbase/0.21.5/pocketbase.es.mjs';
const COVERART_BUFFER = {};
class MusicAddict3_Conf {
    site_url = './';
    db_url = 'http://127.0.0.1:8090';
    game_loop_interval = 3000;
    ui_loop_interval = 1000;
    save_loop_interval = 60000;
    activeplayers_loop_interval = 30000;
    discover_chance = 0.13;
    listening_duration_range = { min: 15000, max: 90000 };
    offer_chance = 0.31;
    offer_interval = { min: 60000, max: 180000 };
    sell_price_mod_range = { min: 1.01, max: 1.5 };
    storage_upgrade_price_mod = 1.3;
    storage_size_max = 100;
    release_year_range = { min: 1950, max: 2064 };
    transactions_list_max = 100;
    log_list_max = 100;
    tradelog_list_max = 100;
    price_tier_ranges = [
        { roll_max: 0.0050, min_cash: 4000, range: { min: 3999, max: 100000 }, tier_level: 6, tier_name: 'Holy Grail' },
        { roll_max: 0.0090, min_cash: 500, range: { min: 499, max: 999 }, tier_level: 5, tier_name: 'Platinum Press' },
        { roll_max: 0.0500, min_cash: 200, range: { min: 199, max: 499 }, tier_level: 4, tier_name: 'First Pressing' },
        { roll_max: 0.2000, min_cash: 50, range: { min: 49, max: 199 }, tier_level: 3, tier_name: 'Signed Copy' },
        { roll_max: 0.2500, min_cash: 20, range: { min: 19, max: 49 }, tier_level: 2, tier_name: 'Limited Edition' },
        { roll_max: 0.3000, min_cash: 7, range: { min: 6, max: 19 }, tier_level: 1, tier_name: 'B-Side Gem' },
        { roll_max: 1.0000, min_cash: 0, range: { min: 0.5, max: 6 }, tier_level: 0, tier_name: 'Common Cut' },
    ];
    reputation_max = 100;
    reputation_gains = {
        buy_record: 0.0131,
        sell_record: 0.0313,
        upgrade_storage: 0.0171,
    };
}
class MusicAddict3_Engine {
    Conf;
    UI;
    DB;
    Worker;
    user_session = {
        is_logged_in: false,
        id: '',
        save_id: '',
        name: 'Anonymous',
    };
    save = {
        data_version: 1,
        theme: 'dark',
        cash: 7,
        records: [],
        collection_worth: { min: 0, max: 0 },
        records_listened: 0,
        records_liked: 0,
        records_disliked: 0,
        trade_income: 0,
        trade_expenses: 0,
        trade_profit: 0,
        trade_offers_accepted: 0,
        trade_offers_declined: 0,
        records_sold: 0,
        records_bought: 0,
        reputation: 0,
        storage_size: 10,
        buy_chance: 0.1,
        sell_chance: 0.9,
        game_started_on: 0,
        next_progress_action: 'digg',
        buy_record: {},
        sell_record: {},
        sell_record_key: 0,
        incoming_offer: false,
        started_listening_on: 0,
        listen_duration: 0,
        session_started_on: 0,
        autosaved_on: 0,
        last_offer_on: 0,
        next_offer_in: 0,
    };
    constructor() {
        this.Conf = new MusicAddict3_Conf();
        this.UI = new MusicAddict3_UI();
        this.DB = new PocketBase(this.Conf.db_url);
        this.Worker = new Worker(`./lib/musicaddict3.worker.mjs?v=${Date.now()}`, { type: 'module' });
        this.Worker.onmessage = (event) => this.on_worker_message(event.data);
        switch (window.location.pathname.split('/').pop()) {
            case '':
            case 'index.html':
                this.init_game();
                break;
            case 'market.html':
                this.init_market();
                break;
        }
    }
    async init_game() {
        this.Worker.postMessage({
            cmd: 'init_game',
            payload: {
                conf: {
                    game_loop_interval: this.Conf.game_loop_interval,
                    ui_loop_interval: this.Conf.ui_loop_interval,
                    save_loop_interval: this.Conf.save_loop_interval,
                }
            },
        });
        const auth_data = await this.auth();
        if (auth_data) {
            this.user_session.is_logged_in = true;
            this.user_session.id = auth_data.record.id;
            this.user_session.name = auth_data.record['username'];
            const loaded_save = await this.load_save();
            if (!loaded_save) {
                this.UI.sysmsg(`Could not load progress data. Please try again.`);
            }
            else {
                const save_data = this.decode_save(loaded_save['data']);
                this.user_session.save_id = loaded_save.id;
                if (!save_data.data_version || save_data.data_version != this.save.data_version) {
                    this.UI.sysmsg(`Sorry, progress data reset required from version ${save_data.data_version} to ${this.save.data_version}.`);
                }
                else {
                    this.save = save_data;
                }
                if (this.save.game_started_on == 0) {
                    this.save.game_started_on = Date.now();
                }
                this.save.session_started_on = 0;
                this.save.autosaved_on = 0;
                this.save.last_offer_on = 0;
                this.save.next_offer_in = 0;
                if (this.save.buy_record.id) {
                    COVERART_BUFFER[this.save.buy_record.id] = Coverart(this.save.buy_record.id, this.save.buy_record.title) ?? '';
                }
                if (this.save.sell_record.id) {
                    COVERART_BUFFER[this.save.sell_record.id] = Coverart(this.save.sell_record.id, this.save.sell_record.title) ?? '';
                }
            }
        }
        this.init_game_ui();
    }
    async init_market() {
        const recent_log_entries = await this.DB.collection('ma3_tradelog').getList(1, this.Conf.tradelog_list_max, { sort: '-created' });
        for (const log_entry of recent_log_entries.items) {
            this.add_to_marked_trades_list(log_entry, true);
        }
        await this.DB.collection('ma3_tradelog').subscribe('*', (e) => this.add_to_marked_trades_list(e.record), { sort: '-created' });
        this.Worker.postMessage({
            cmd: 'init_market',
            payload: {
                conf: {
                    activeplayers_loop_interval: this.Conf.activeplayers_loop_interval,
                },
            },
        });
        this.UI.unhide(this.UI.e.tradelog);
        this.UI.unbusy(this.UI.e.loading);
    }
    async auth() {
        try {
            if (this.DB.authStore.isValid) {
                const auth_data = await this.DB.collection('ma3_users').authRefresh();
                return auth_data;
            }
        }
        catch (boo) {
            this.UI.sysmsg('Re-authentication failed.');
        }
        return null;
    }
    async load_save() {
        try {
            const existing_save = await this.DB.collection('ma3_saves').getFirstListItem(`user="${this.user_session.id}"`, { skipTotal: true });
            return existing_save;
        }
        catch (itsjustanewgame) { }
        try {
            const new_save = await this.DB.collection('ma3_saves').create({ user: this.user_session.id, data: this.encode_save(this.save) });
            return new_save;
        }
        catch (boo) {
            return null;
        }
    }
    async store_save() {
        try {
            const stored_save_data = await this.DB.collection('ma3_saves').update(this.user_session.save_id, { user: this.user_session.id, data: this.encode_save(this.save) });
            return stored_save_data;
        }
        catch (boo) {
            return null;
        }
    }
    init_game_ui() {
        this.set_theme(this.save.theme);
        this.UI.e.signin_register_submit.addEventListener('click', () => this.on_register_submit());
        this.UI.e.signin_login_submit.addEventListener('click', () => this.on_login_submit());
        this.UI.e.ctrl_logout.addEventListener('click', () => this.on_logout_submit());
        this.UI.e.ctrl_play.addEventListener('click', () => this.on_game_ctrl_play());
        this.UI.e.ctrl_pause.addEventListener('click', () => this.on_game_ctrl_pause());
        this.UI.e.ctrl_reset.addEventListener('click', () => this.on_game_ctrl_reset());
        this.UI.e.ctrl_buy_chance_input.addEventListener('change', () => this.on_ctrl_buy_chance());
        this.UI.e.ctrl_sell_chance_input.addEventListener('change', () => this.on_ctrl_sell_chance());
        this.UI.e.ctrl_upgrade_storage.addEventListener('click', () => this.on_ctrl_upgrade_storage());
        this.UI.e.ctrl_theme.addEventListener('click', () => this.on_ctrl_theme());
        this.UI.e.ctrl_bgmusic.addEventListener('click', () => this.on_ctrl_bgmusic());
        for (const dialog of document.querySelectorAll('dialog')) {
            dialog.querySelector('.close')?.addEventListener('click', () => {
                dialog.close();
            });
        }
        if (!this.user_session.is_logged_in) {
            this.UI.unhide([this.UI.e.intro, this.UI.e.signin_register, this.UI.e.signin_login]);
            this.UI.open(this.UI.e.intro);
        }
        else {
            this.UI.hide([this.UI.e.signin_register, this.UI.e.signin_login]);
            this.UI.unopen(this.UI.e.intro);
            this.UI.unhide([this.UI.e.intro, this.UI.e.game, this.UI.e.player_name]);
            this.UI.sysmsg(`Hello ${this.user_session.name}!`);
        }
        this.UI.e.player_name_value.innerHTML = this.user_session.name;
        this.UI.e.stats_started_on_value.innerHTML = Fmt.timestamp(this.save.game_started_on);
        this.UI.e.ctrl_buy_chance_value.innerHTML = Fmt.percent(1.0 - this.save.buy_chance);
        this.UI.e.ctrl_buy_chance_input.value = String(1.0 - this.save.buy_chance);
        this.UI.e.ctrl_sell_chance_value.innerHTML = Fmt.percent(1.0 - this.save.sell_chance);
        this.UI.e.ctrl_sell_chance_input.value = String(1.0 - this.save.sell_chance);
        this.UI.e.ctrl_upgrade_storage_value.innerHTML = Fmt.cash(this.next_storage_slot_price());
        this.UI.e.stats_records_missed_value.innerHTML = `${this.save.records_liked - this.save.records_bought}`;
        this.init_collection_list();
        this.UI.unhide(this.UI.e.signin);
        this.UI.unbusy(this.UI.e.loading);
        this.update_ui();
    }
    update_ui() {
        this.UI.e.stats_cash_value.innerHTML = Fmt.cash(this.save.cash);
        this.UI.e.stats_records_value.innerHTML = `${this.save.records.length} / ${this.save.storage_size}`;
        this.UI.e.stats_reputation_value.innerHTML = (this.save.reputation <= this.Conf.reputation_max) ? `${Fmt.float(this.save.reputation, 4)}` : `${Fmt.float(this.save.reputation, 4)} <small>(maxed out)</small>`;
        this.UI.e.stats_session_duration_value.innerHTML = (this.save.session_started_on > 0) ? Fmt.duration((Date.now() - this.save.session_started_on)) : '-';
        this.UI.e.stats_autosaved_ago_value.innerHTML = (this.save.autosaved_on > 0) ? ((Date.now() - this.save.autosaved_on < this.Conf.save_loop_interval) ? Fmt.duration(Date.now() - this.save.autosaved_on) : `<span class="negative">${Fmt.duration(Date.now() - this.save.autosaved_on)}</span>`) : '<span class="negative">-</span>';
        this.UI.e.stats_next_offer_in_value.innerHTML = (this.save.last_offer_on > 0) ? Fmt.duration((this.save.last_offer_on + this.save.next_offer_in) - Date.now()) : '-';
        this.UI.e.stats_collection_worth_value.innerHTML = `${Fmt.cash(Math.max(0, this.save.collection_worth.min))} &dash; ${Fmt.cash(Math.max(0, this.save.collection_worth.max))}`;
        this.UI.e.stats_records_listened_value.innerHTML = `${this.save.records_listened}`;
        this.UI.e.stats_records_liked_value.innerHTML = `${this.save.records_liked}`;
        this.UI.e.stats_records_disliked_value.innerHTML = `${this.save.records_disliked}`;
        this.UI.e.stats_trade_income_value.innerHTML = Fmt.cash(this.save.trade_income);
        this.UI.e.stats_trade_expenses_value.innerHTML = Fmt.cash(this.save.trade_expenses);
        this.UI.e.stats_trade_profit_value.innerHTML = Fmt.cash(this.save.trade_profit);
        this.UI.e.stats_records_sold_value.innerHTML = `${this.save.records_sold}`;
        this.UI.e.stats_records_bought_value.innerHTML = `${this.save.records_bought}`;
        this.UI.e.stats_trade_offers_accepted_value.innerHTML = `${this.save.trade_offers_accepted}`;
        this.UI.e.stats_trade_offers_declined_value.innerHTML = `${this.save.trade_offers_declined}`;
        if (this.save.storage_size == this.Conf.storage_size_max) {
            this.UI.disable(this.UI.e.ctrl_upgrade_storage);
            this.UI.e.ctrl_upgrade_storage_value.innerHTML = '<small>maxed out</small>';
        }
        else {
            if (this.save.cash < this.next_storage_slot_price()) {
                this.UI.disable(this.UI.e.ctrl_upgrade_storage);
            }
            else {
                this.UI.undisable(this.UI.e.ctrl_upgrade_storage);
            }
        }
    }
    progress() {
        if (this.save.last_offer_on == 0) {
            this.save.last_offer_on = Date.now();
            this.save.next_offer_in = Rnd.float(this.Conf.offer_interval.min, this.Conf.offer_interval.max);
        }
        if (Rnd.roll(this.Conf.offer_chance)
            && Date.now() - this.save.last_offer_on > this.save.next_offer_in
            && this.save.records.length > 0
            && ['broke', 'digg'].includes(this.save.next_progress_action)) {
            this.save.incoming_offer = true;
            this.save.next_progress_action = 'getoffer';
        }
        else if (this.save.cash == 0
            && !this.save.incoming_offer) {
            this.save.next_progress_action = 'broke';
        }
        switch (this.save.next_progress_action) {
            case 'digg':
                this.add_log_line(`Digging for cool records.`);
                if (Rnd.roll(this.Conf.discover_chance)) {
                    this.save.next_progress_action = 'discover';
                }
                break;
            case 'discover':
                this.save.buy_record = this.random_record();
                this.add_log_line(`Discovered ${Fmt.record(this.save.buy_record)}.`);
                this.save.next_progress_action = 'listen';
                break;
            case 'listen':
                this.add_log_line(`Listening.`);
                if (this.save.started_listening_on == 0) {
                    this.save.started_listening_on = Date.now();
                    this.save.listen_duration = Rnd.int(this.Conf.listening_duration_range.min, this.Conf.listening_duration_range.max);
                }
                else if (Date.now() - this.save.started_listening_on > this.save.listen_duration) {
                    this.save.started_listening_on = 0;
                    this.save.records_listened += 1;
                    if (Rnd.roll(this.save.buy_chance)) {
                        this.save.records_liked += 1;
                        this.add_log_line(`You like what you hear.`);
                        this.save.next_progress_action = 'buy';
                    }
                    else {
                        this.save.records_disliked += 1;
                        this.add_log_line(`You don't like what you hear.`);
                        this.save.next_progress_action = 'nobuy';
                    }
                }
                break;
            case 'buy':
                if (this.save.cash < this.save.buy_record.buy_price.amount) {
                    this.UI.e.stats_records_missed_value.innerHTML = `${this.save.records_liked - this.save.records_bought}`;
                    this.add_log_line(`Not enough cash to buy ${Fmt.record(this.save.buy_record)} for <span class="negative">${Fmt.cash(this.save.buy_record.buy_price.amount)}</span> (need <span class="negative">${Fmt.cash(this.save.buy_record.buy_price.amount - this.save.cash)}</span> more).`);
                }
                else if (this.save.records.length + 1 > this.save.storage_size) {
                    this.UI.e.stats_records_missed_value.innerHTML = `${this.save.records_liked - this.save.records_bought}`;
                    this.add_log_line(`Not enough space to store ${Fmt.record(this.save.buy_record)}.`);
                }
                else {
                    this.save.cash -= this.save.buy_record.buy_price.amount;
                    this.save.reputation += this.reputation_gain('buy_record');
                    this.save.trade_expenses += this.save.buy_record.buy_price.amount;
                    this.save.records_bought += 1;
                    this.save.records.push(this.save.buy_record);
                    this.add_to_collection_list(this.save.buy_record);
                    this.add_to_transactions_list('buy_record', this.save.buy_record.buy_price.amount);
                    this.log_trade('buy', this.save.buy_record);
                    this.add_log_line(`Bought ${Fmt.record(this.save.buy_record)} for <span class="negative">${Fmt.cash(this.save.buy_record.buy_price.amount)}</span>.`);
                }
                this.save.next_progress_action = 'digg';
                break;
            case 'nobuy':
                this.add_log_line(`Going to another corner of the store.`);
                this.save.next_progress_action = 'digg';
                break;
            case 'broke':
                this.add_log_line(`You're broke.`);
                break;
            case 'getoffer':
                this.save.last_offer_on = Date.now();
                this.save.next_offer_in = Rnd.float(this.Conf.offer_interval.min, this.Conf.offer_interval.max) - this.offer_interval_reduction();
                this.save.sell_record_key = Rnd.array_key(this.save.records);
                this.save.sell_record = this.save.records[this.save.sell_record_key];
                this.save.sell_record.sell_price = this.record_sell_price(this.save.sell_record.buy_price);
                this.add_log_line(`Someone wants to buy ${Fmt.record(this.save.sell_record)} from your collection.`);
                if (Rnd.roll(this.save.sell_chance)) {
                    this.save.trade_offers_accepted += 1;
                    this.save.next_progress_action = 'sell';
                }
                else {
                    this.save.trade_offers_declined += 1;
                    this.save.next_progress_action = 'nosell';
                }
                break;
            case 'sell':
                this.save.incoming_offer = false;
                this.save.cash += this.save.sell_record.sell_price.amount;
                this.save.reputation += this.reputation_gain('sell_record');
                this.save.trade_income += this.save.sell_record.sell_price.amount;
                this.save.trade_profit += this.save.sell_record.sell_price.amount - this.save.sell_record.buy_price.amount;
                this.save.records_sold += 1;
                this.save.records.splice(this.save.sell_record_key, 1);
                this.remove_from_collection_list(this.save.sell_record);
                this.add_to_transactions_list('sell_record', this.save.sell_record.sell_price.amount);
                this.log_trade('sell', this.save.sell_record);
                this.add_log_line(`Sold it for <span class="positive">${Fmt.cash(this.save.sell_record.sell_price.amount)}</span> (<span class="positive">${Fmt.cash(this.save.sell_record.sell_price.amount - this.save.sell_record.buy_price.amount)}</span> profit).`);
                this.save.next_progress_action = 'digg';
                break;
            case 'nosell':
                this.add_log_line(`Naah, you hold on to this one for now.`);
                this.save.incoming_offer = false;
                this.save.next_progress_action = 'digg';
                break;
            default:
                console.warn('unhandled progress action:', this.save.next_progress_action);
        }
    }
    add_log_line(message) {
        const line = document.createElement('div');
        line.classList.add('log_line');
        line.innerHTML = `<small class="time">${Fmt.timestamp(Date.now(), '{hours}:{minutes}')}</small> <span class="message">${message}</span>`;
        this.UI.e.log_lines.prepend(line);
        if (this.UI.e.log_lines.childNodes.length > this.Conf.log_list_max) {
            this.UI.e.log_lines.lastChild?.remove();
        }
    }
    init_collection_list() {
        this.save.collection_worth.min = 0;
        this.save.collection_worth.max = 0;
        for (const record of this.save.records) {
            COVERART_BUFFER[record.id] = Coverart(record.id, record.title) ?? '';
            this.add_to_collection_list(record);
        }
    }
    add_to_collection_list(record) {
        this.update_collection_worth('add', record.buy_price);
        const e = document.createElement('div');
        e.classList.add('record', `tier_${record.buy_price.tier.tier_level}`);
        e.dataset['id'] = record.id;
        e.innerHTML = `<img src="${COVERART_BUFFER[record.id]}" class="cover tier_${record.buy_price.tier.tier_level}">`;
        e.addEventListener('click', () => {
            this.UI.e.record_info_title.innerHTML = Fmt.discogs_link('release', record.title);
            this.UI.e.record_info_coverart.innerHTML = `<img src="${COVERART_BUFFER[record.id]}" class="cover">`;
            this.UI.e.record_info_meta.innerHTML = `
                <p>
                    <small>Artist:</small> <strong>${Fmt.discogs_link('artist', record.artist)}</strong><br>
                    <small>Year:</small> <strong>${Fmt.discogs_link('year', record.year)}</strong><br>
                    <small>Style:</small> <strong>${Fmt.discogs_link('style', record.style)}</strong><br>
                    <small>Format:</small> <strong>${Fmt.discogs_link('format', record.format)}</strong>
                </p>
                <p>
                    <small>Tier:</small> <span class="tier_${record.buy_price.tier.tier_level}">${record.buy_price.tier.tier_level}, ${record.buy_price.tier.tier_name}</span><br>
                    <small>Bought for:</small> <span class="negative">${Fmt.cash(record.buy_price.amount)}</span><br>
                    <small>Sells for:</small> <span class="positive">${Fmt.cash(record.buy_price.amount * this.Conf.sell_price_mod_range.min)} - ${Fmt.cash(record.buy_price.amount * this.Conf.sell_price_mod_range.max)}</span>
                </p>
            `;
            this.UI.e.record_info.showModal();
        });
        this.UI.e.collection_list.prepend(e);
    }
    remove_from_collection_list(record) {
        this.update_collection_worth('substract', record.buy_price);
        delete COVERART_BUFFER[record.id];
        this.UI.e.collection_list.querySelector(`[data-id='${record.id}']`)?.remove();
    }
    add_to_transactions_list(type, amount) {
        const e = document.createElement('div');
        e.innerHTML = `<span class="time">${Fmt.timestamp(Date.now(), '{hours}:{minutes}')}</span><br>`;
        switch (type) {
            case 'buy_record':
                e.innerHTML += `buy record<br><span class="negative">-${Fmt.cash(amount)}</span><br>`;
                this.UI.e.transactions_list.prepend(e);
                break;
            case 'sell_record':
                e.innerHTML += `sell record<br><span class="positive">+${Fmt.cash(amount)}</span><br>`;
                this.UI.e.transactions_list.prepend(e);
                break;
            case 'buy_storage':
                e.innerHTML += `buy storage<br><span class="negative">-${Fmt.cash(amount)}</span><br>`;
                this.UI.e.transactions_list.prepend(e);
                break;
        }
        if (this.UI.e.transactions_list.childNodes.length > this.Conf.transactions_list_max) {
            this.UI.e.transactions_list.lastChild?.remove();
        }
    }
    update_collection_worth(mode, buy_price) {
        const min = buy_price.amount * this.Conf.sell_price_mod_range.min;
        const max = buy_price.amount * this.Conf.sell_price_mod_range.max;
        switch (mode) {
            case 'add':
                this.save.collection_worth.min += min;
                this.save.collection_worth.max += max;
                break;
            case 'substract':
                this.save.collection_worth.min -= min;
                this.save.collection_worth.max -= max;
                break;
        }
    }
    async on_worker_message(message) {
        switch (message.cmd) {
            case 'game_loop_tick':
                this.progress();
                this.Worker.postMessage({
                    cmd: 'plan_next_game_loop_tick',
                    payload: {},
                });
                break;
            case 'ui_loop_tick':
                this.update_ui();
                this.Worker.postMessage({
                    cmd: 'plan_next_ui_loop_tick',
                    payload: {},
                });
                break;
            case 'save_loop_tick':
                const stored_save_data = await this.store_save();
                if (!stored_save_data) {
                    this.UI.sysmsg('Progress auto-save failed, will retry automatically.');
                }
                else {
                    this.save.autosaved_on = new Date(stored_save_data.updated).getTime();
                }
                this.Worker.postMessage({
                    cmd: 'plan_next_save_loop_tick',
                    payload: {},
                });
                break;
            case 'activeplayers_loop_tick':
                try {
                    const activeplayers = await this.DB.collection('ma3_activeplayers').getOne('1', {});
                    this.UI.e.activeplayers_count_value.innerHTML = `${activeplayers['activeplayers_count']}`;
                }
                catch (boo) { }
                this.Worker.postMessage({
                    cmd: 'plan_next_activeplayers_loop_tick',
                    payload: {},
                });
                break;
            default:
                console.warn('main got unhandled command:', message.cmd);
        }
    }
    async on_register_submit() {
        this.UI.busy(this.UI.e.signin_register_submit);
        const username = this.UI.e.signin_register_username.value.trim();
        const password = this.UI.e.signin_register_password.value.trim();
        const passwordconfirm = this.UI.e.signin_register_passwordconfirm.value.trim();
        if (!username || !password || !passwordconfirm) {
            this.UI.sysmsg(`Fill out all fields to register.`);
            this.UI.unbusy(this.UI.e.signin_register_submit);
            return;
        }
        try {
            await this.DB.collection('ma3_users').create({ username: username, password: password, passwordConfirm: passwordconfirm });
            await this.DB.collection('ma3_users').authWithPassword(username, password);
            if (!this.DB.authStore.isValid) {
                this.UI.unbusy(this.UI.e.signin_register_submit);
            }
            else {
                this.reload();
            }
        }
        catch (boo) {
            this.UI.sysmsg('Could not create new user data. Please check your input and try again.');
            this.UI.unbusy(this.UI.e.signin_register_submit);
        }
    }
    async on_login_submit() {
        this.UI.busy(this.UI.e.signin_login_submit);
        const username = this.UI.e.signin_login_username.value.trim();
        const password = this.UI.e.signin_login_password.value.trim();
        if (!username || !password) {
            this.UI.sysmsg('Fill out all fields to login.');
            this.UI.unbusy(this.UI.e.signin_login_submit);
            return;
        }
        try {
            await this.DB.collection('ma3_users').authWithPassword(username, password);
            if (!this.DB.authStore.isValid) {
                this.UI.unbusy(this.UI.e.signin_login_submit);
            }
            else {
                this.reload();
            }
        }
        catch (boo) {
            this.UI.sysmsg('Could not authenticate. Please check your input and try again.');
            this.UI.unbusy(this.UI.e.signin_login_submit);
        }
    }
    on_logout_submit() {
        this.UI.busy(this.UI.e.loading);
        this.UI.hide([this.UI.e.intro, this.UI.e.game]);
        this.UI.sysmsg(`Bye, see you soon ${this.user_session.name}!`);
        this.Worker.postMessage({
            cmd: 'pause',
            payload: {},
        });
        this.DB.authStore.clear();
        setTimeout(() => this.reload(), 2000);
    }
    on_game_ctrl_play() {
        this.UI.hide([this.UI.e.ctrl_play, this.UI.e.ctrl_logout, this.UI.e.ctrl_reset]);
        this.UI.unhide([this.UI.e.ctrl_pause, this.UI.e.ctrl_upgrade_storage]);
        this.UI.undisable([this.UI.e.ctrl_buy_chance_input, this.UI.e.ctrl_sell_chance_input]);
        this.save.session_started_on = Date.now();
        this.update_ui();
        this.add_log_line(`You enter the record store.`);
        this.Worker.postMessage({
            cmd: 'play',
            payload: {},
        });
    }
    on_game_ctrl_pause() {
        this.UI.unhide([this.UI.e.ctrl_play, this.UI.e.ctrl_logout, this.UI.e.ctrl_reset]);
        this.UI.hide([this.UI.e.ctrl_pause, this.UI.e.ctrl_upgrade_storage]);
        this.UI.disable([this.UI.e.ctrl_buy_chance_input, this.UI.e.ctrl_sell_chance_input]);
        this.update_ui();
        this.add_log_line(`You leave the record store.`);
        this.Worker.postMessage({
            cmd: 'pause',
            payload: {},
        });
    }
    async on_game_ctrl_reset() {
        this.UI.disable([this.UI.e.ctrl_reset, this.UI.e.ctrl_play, this.UI.e.ctrl_logout, this.UI.e.ctrl_theme, this.UI.e.ctrl_bgmusic]);
        if (!confirm(`If you really want to reset all game progress, click 'OK'. If not, click 'CANCEL'.`)) {
            this.UI.undisable([this.UI.e.ctrl_reset, this.UI.e.ctrl_play, this.UI.e.ctrl_logout, this.UI.e.ctrl_theme, this.UI.e.ctrl_bgmusic]);
            return;
        }
        try {
            const save_deleted = await this.DB.collection('ma3_saves').delete(this.user_session.save_id);
            if (!save_deleted) {
                this.UI.sysmsg(`Could not reset progress data. Please try again.`);
                this.UI.undisable([this.UI.e.ctrl_reset, this.UI.e.ctrl_play, this.UI.e.ctrl_logout, this.UI.e.ctrl_theme, this.UI.e.ctrl_bgmusic]);
            }
            else {
                this.reload();
            }
        }
        catch (boo) {
            this.UI.sysmsg(`Could not reset progress data. Please try again.`);
            this.UI.undisable([this.UI.e.ctrl_reset, this.UI.e.ctrl_play, this.UI.e.ctrl_logout, this.UI.e.ctrl_theme, this.UI.e.ctrl_bgmusic]);
        }
    }
    on_ctrl_buy_chance() {
        this.save.buy_chance = 1.0 - Number(this.UI.e.ctrl_buy_chance_input.value);
        this.UI.e.ctrl_buy_chance_value.innerHTML = Fmt.percent(1.0 - this.save.buy_chance);
    }
    on_ctrl_sell_chance() {
        this.save.sell_chance = 1.0 - Number(this.UI.e.ctrl_sell_chance_input.value);
        this.UI.e.ctrl_sell_chance_value.innerHTML = Fmt.percent(1.0 - this.save.sell_chance);
    }
    on_ctrl_upgrade_storage() {
        this.UI.disable(this.UI.e.ctrl_upgrade_storage);
        if (this.save.storage_size == this.Conf.storage_size_max) {
            return;
        }
        const next_storage_slot_price = this.next_storage_slot_price();
        if (this.save.cash < next_storage_slot_price) {
            return;
        }
        this.save.cash -= next_storage_slot_price;
        this.save.storage_size += 1;
        this.save.reputation += this.reputation_gain('upgrade_storage');
        this.UI.e.ctrl_upgrade_storage_value.innerHTML = Fmt.cash(this.next_storage_slot_price());
        this.add_to_transactions_list('buy_storage', next_storage_slot_price);
        this.add_log_line(`Bought a storage slot for <span class="negative">${Fmt.cash(next_storage_slot_price)}</span>.`);
    }
    on_ctrl_theme() {
        let theme = document.documentElement.dataset['theme'] || 'dark';
        if (theme == 'dark') {
            this.set_theme('light');
        }
        else {
            this.set_theme('dark');
        }
    }
    on_ctrl_bgmusic() {
        this.UI.e.bgmusic_player.showModal();
    }
    set_theme(theme) {
        document.documentElement.dataset['theme'] = theme;
        this.save.theme = theme;
    }
    reputation_gain(type) {
        if (this.save.reputation >= this.Conf.reputation_max) {
            return 0;
        }
        return this.Conf.reputation_gains[type];
    }
    next_storage_slot_price() {
        return (this.save.storage_size + 1) * this.Conf.storage_upgrade_price_mod;
    }
    encode_save(data) {
        return btoa(JSON.stringify(data));
    }
    decode_save(data) {
        return JSON.parse(atob(data));
    }
    reload() {
        window.location.replace(this.Conf.site_url);
    }
    random_record() {
        const title = Rnd.record_title();
        const artist = Rnd.artist_name();
        const year = Rnd.int(this.Conf.release_year_range.min, this.Conf.release_year_range.max);
        const style = Rnd.music_style();
        const format = Rnd.record_format();
        const id = this.record_id(title, artist);
        const buy_price = this.record_buy_price();
        COVERART_BUFFER[id] = Coverart(id, title) ?? '';
        return {
            title: title,
            artist: artist,
            year: year,
            style: style,
            format: format,
            id: id,
            buy_price: buy_price,
            sell_price: {},
        };
    }
    record_buy_price() {
        let price;
        for (const t of this.Conf.price_tier_ranges) {
            const roll = Math.random();
            if (this.save.cash >= t.min_cash && roll <= t.roll_max) {
                price = {
                    amount: Rnd.float(t.range.min, t.range.max),
                    tier: t,
                };
                break;
            }
        }
        return price;
    }
    record_sell_price(buy_price) {
        return {
            amount: buy_price.amount * Rnd.float(this.Conf.sell_price_mod_range.min, this.Conf.sell_price_mod_range.max),
        };
    }
    record_id(title, artist, id_length = 64) {
        const id_char_rep_map = {
            'a': '2',
            'b': '3',
            'c': '5',
            'd': '7',
            'e': '11',
            'f': '13',
            'g': '17',
            'h': '19',
            'i': '23',
            'j': '29',
            'k': '31',
            'l': '37',
            'm': '41',
            'n': '43',
            'o': '47',
            'p': '53',
            'q': '59',
            'r': '61',
            's': '67',
            't': '71',
            'u': '73',
            'v': '79',
            'w': '83',
            'x': '89',
            'y': '97',
            'z': '101',
        };
        let id = artist + title;
        id = id.replace(/[^\w\d]/g, '').toLowerCase();
        for (const [k, v] of Object.entries(id_char_rep_map)) {
            id = id.replaceAll(k, v);
        }
        if (id.length < id_length) {
            id = id.repeat(Math.ceil(id_length / id.length));
        }
        id = id.substring(0, id_length);
        return id;
    }
    offer_interval_reduction() {
        return Math.min(this.Conf.reputation_max, this.save.reputation) * (this.Conf.offer_interval.min / this.Conf.reputation_max);
    }
    async log_trade(type, record) {
        try {
            const log_status = await this.DB.collection('ma3_tradelog').create({
                user_name: this.user_session.name,
                trade_type: type,
                record: JSON.stringify(record),
            });
            return log_status;
        }
        catch (boo) {
            console.warn('Could not log trade:', type, record);
            return null;
        }
    }
    add_to_marked_trades_list(log_entry, append = false) {
        const entry = document.createElement('tr');
        entry.innerHTML = `
            <td>${log_entry['user_name']}</td>
            <td>${Fmt.timestamp(Date.parse(log_entry.created), '{year}-{month}-{day} {hours}:{minutes}')}</td>
            <td>${(log_entry['trade_type'] == 'buy') ? Fmt.cash(log_entry['record'].buy_price.amount) : ''}</td>
            <td>${(log_entry['trade_type'] == 'sell') ? Fmt.cash(log_entry['record'].sell_price.amount) : ''}</td>
            <td>${(log_entry['trade_type'] == 'sell') ? Fmt.cash(log_entry['record'].sell_price.amount - log_entry['record'].buy_price.amount) : ''}</td>
            <td>${Fmt.record(log_entry['record'], Coverart(log_entry['record'].id, log_entry['record'].title) ?? '')}</td>
        `;
        if (append) {
            this.UI.e.tradelog_list.append(entry);
        }
        else {
            this.UI.e.tradelog_list.prepend(entry);
        }
        if (this.UI.e.tradelog_list.childNodes.length > this.Conf.tradelog_list_max) {
            this.UI.e.tradelog_list.lastChild?.remove();
        }
    }
}
class MusicAddict3_UI {
    e = {
        sysmsg: document.querySelector('.sysmsg'),
        app: document.querySelector('.sysmsg'),
        loading: document.querySelector('.loading'),
        intro: document.querySelector('.intro'),
        game: document.querySelector('.game'),
        record_info: document.querySelector('.record_info'),
        record_info_title: document.querySelector('.record_info_title'),
        record_info_coverart: document.querySelector('.record_info_coverart'),
        record_info_meta: document.querySelector('.record_info_meta'),
        bgmusic_player: document.querySelector('.bgmusic_player'),
        signin: document.querySelector('.signin'),
        signin_register: document.querySelector('.signin_register'),
        signin_register_username: document.querySelector('.signin_register_username'),
        signin_register_password: document.querySelector('.signin_register_password'),
        signin_register_passwordconfirm: document.querySelector('.signin_register_passwordconfirm'),
        signin_register_submit: document.querySelector('.signin_register_submit'),
        signin_login: document.querySelector('.signin_login'),
        signin_login_username: document.querySelector('.signin_login_username'),
        signin_login_password: document.querySelector('.signin_login_password'),
        signin_login_submit: document.querySelector('.signin_login_submit'),
        ctrl: document.querySelector('.ctrl'),
        ctrl_play: document.querySelector('.ctrl_play'),
        ctrl_pause: document.querySelector('.ctrl_pause'),
        ctrl_logout: document.querySelector('.ctrl_logout'),
        ctrl_reset: document.querySelector('.ctrl_reset'),
        ctrl_upgrade_storage: document.querySelector('.ctrl_upgrade_storage'),
        ctrl_upgrade_storage_value: document.querySelector('.ctrl_upgrade_storage_value'),
        ctrl_theme: document.querySelector('.ctrl_theme'),
        ctrl_bgmusic: document.querySelector('.ctrl_bgmusic'),
        ctrl_buy_chance: document.querySelector('.ctrl_buy_chance'),
        ctrl_buy_chance_value: document.querySelector('.ctrl_buy_chance_value'),
        ctrl_buy_chance_input: document.querySelector('.ctrl_buy_chance input[type=range]'),
        ctrl_sell_chance: document.querySelector('.ctrl_sell_chance'),
        ctrl_sell_chance_value: document.querySelector('.ctrl_sell_chance_value'),
        ctrl_sell_chance_input: document.querySelector('.ctrl_sell_chance input[type=range]'),
        stats: document.querySelector('.stats'),
        stats_cash: document.querySelector('.stats_cash'),
        stats_cash_value: document.querySelector('.stats_cash_value'),
        stats_records: document.querySelector('.stats_records'),
        stats_records_value: document.querySelector('.stats_records_value'),
        stats_reputation: document.querySelector('.stats_reputation'),
        stats_reputation_value: document.querySelector('.stats_reputation_value'),
        stats_started_on: document.querySelector('.stats_started_on'),
        stats_started_on_value: document.querySelector('.stats_started_on_value'),
        stats_session_duration: document.querySelector('.stats_session_duration'),
        stats_session_duration_value: document.querySelector('.stats_session_duration_value'),
        stats_autosaved_ago: document.querySelector('.stats_autosaved_ago'),
        stats_autosaved_ago_value: document.querySelector('.stats_autosaved_ago_value'),
        stats_next_offer_in: document.querySelector('.stats_next_offer_in'),
        stats_next_offer_in_value: document.querySelector('.stats_next_offer_in_value'),
        stats_collection_worth: document.querySelector('.stats_collection_worth'),
        stats_collection_worth_value: document.querySelector('.stats_collection_worth_value'),
        stats_trade_income: document.querySelector('.stats_trade_income'),
        stats_trade_income_value: document.querySelector('.stats_trade_income_value'),
        stats_trade_expenses: document.querySelector('.stats_trade_expenses'),
        stats_trade_expenses_value: document.querySelector('.stats_trade_expenses_value'),
        stats_trade_profit: document.querySelector('.stats_trade_profit'),
        stats_trade_profit_value: document.querySelector('.stats_trade_profit_value'),
        stats_records_sold: document.querySelector('.stats_records_sold'),
        stats_records_sold_value: document.querySelector('.stats_records_sold_value'),
        stats_records_bought: document.querySelector('.stats_records_bought'),
        stats_records_bought_value: document.querySelector('.stats_records_bought_value'),
        stats_trade_offers_accepted: document.querySelector('.stats_trade_offers_accepted'),
        stats_trade_offers_accepted_value: document.querySelector('.stats_trade_offers_accepted_value'),
        stats_trade_offers_declined: document.querySelector('.stats_trade_offers_declined'),
        stats_trade_offers_declined_value: document.querySelector('.stats_trade_offers_declined_value'),
        stats_records_listened: document.querySelector('.stats_records_listened'),
        stats_records_listened_value: document.querySelector('.stats_records_listened_value'),
        stats_records_liked: document.querySelector('.stats_records_liked'),
        stats_records_liked_value: document.querySelector('.stats_records_liked_value'),
        stats_records_disliked: document.querySelector('.stats_records_disliked'),
        stats_records_disliked_value: document.querySelector('.stats_records_disliked_value'),
        stats_records_missed: document.querySelector('.stats_records_missed'),
        stats_records_missed_value: document.querySelector('.stats_records_missed_value'),
        transactions: document.querySelector('.transactions'),
        transactions_list: document.querySelector('.transactions_list'),
        collection: document.querySelector('.collection'),
        collection_list: document.querySelector('.collection_list'),
        log: document.querySelector('.log'),
        log_lines: document.querySelector('.log_lines'),
        tradelog: document.querySelector('.tradelog'),
        tradelog_list: document.querySelector('.tradelog_list'),
        activeplayers_count_value: document.querySelector('.activeplayers_count_value'),
        player_name: document.querySelector('.player_name'),
        player_name_value: document.querySelector('.player_name_value'),
    };
    sysmsg(msg, autoremove = true, autoremove_delay = 7000) {
        const msg_element = document.createElement('p');
        msg_element.innerHTML = msg;
        msg_element.addEventListener('click', () => msg_element.remove());
        this.e.sysmsg.prepend(msg_element);
        if (autoremove) {
            setTimeout(() => msg_element.remove(), autoremove_delay);
        }
    }
    hide(e) {
        if (!(e instanceof Array)) {
            e.classList.add('hide');
        }
        else {
            for (const ele of e) {
                ele.classList.add('hide');
            }
        }
    }
    unhide(e) {
        if (!(e instanceof Array)) {
            e.classList.remove('hide');
        }
        else {
            for (const ele of e) {
                ele.classList.remove('hide');
            }
        }
    }
    clear_content(e) {
        if (!(e instanceof Array)) {
            e.innerHTML = '';
        }
        else {
            for (const ele of e) {
                ele.innerHTML = '';
            }
        }
    }
    clear_input(e) {
        if (!(e instanceof Array)) {
            e.value = '';
        }
        else {
            for (const ele of e) {
                ele.value = '';
            }
        }
    }
    busy(e) {
        if (!(e instanceof Array)) {
            e.setAttribute('aria-busy', 'true');
            e.setAttribute('disabled', 'disabled');
        }
        else {
            for (const ele of e) {
                ele.setAttribute('aria-busy', 'true');
                ele.setAttribute('disabled', 'disabled');
            }
        }
    }
    unbusy(e) {
        if (!(e instanceof Array)) {
            e.removeAttribute('aria-busy');
            e.removeAttribute('disabled');
        }
        else {
            for (const ele of e) {
                ele.removeAttribute('aria-busy');
                ele.removeAttribute('disabled');
            }
        }
    }
    disable(e) {
        if (!(e instanceof Array)) {
            e.setAttribute('disabled', 'disabled');
        }
        else {
            for (const ele of e) {
                ele.setAttribute('disabled', 'disabled');
            }
        }
    }
    undisable(e) {
        if (!(e instanceof Array)) {
            e.removeAttribute('disabled');
        }
        else {
            for (const ele of e) {
                ele.removeAttribute('disabled');
            }
        }
    }
    open(e) {
        if (!(e instanceof Array)) {
            e.setAttribute('open', 'open');
        }
        else {
            for (const ele of e) {
                ele.setAttribute('open', 'open');
            }
        }
    }
    unopen(e) {
        if (!(e instanceof Array)) {
            e.removeAttribute('open');
        }
        else {
            for (const ele of e) {
                ele.removeAttribute('open');
            }
        }
    }
}
const Coverart = (record_id, record_title) => {
    const rgbval = (num) => {
        return Number(num) % 255;
    };
    const rgbvalinv = (num) => {
        return 255 - rgbval(num);
    };
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.warn('could not create canvas context');
            return null;
        }
        canvas.width = 100;
        canvas.height = 100;
        let rgba_opacity = 1.0;
        ctx.fillStyle = `rgba(${rgbval(record_id.substring(0, 3))}, ${rgbval(record_id.substring(3, 6))}, ${rgbval(record_id.substring(6, 9))}, ${rgba_opacity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const arcs = [];
        let arcvalpos = {
            x: { start: 33, end: 35 },
            y: { start: 35, end: 37 },
            radius: { start: 37, end: 39 },
            startangle: { start: 39, end: 41 },
            endangle: { start: 41, end: 43 },
            counterclockwise: false,
        };
        for (let c = 0; c < 3; c++) {
            arcs.push({
                x: Number(record_id.substring(arcvalpos.x.start, arcvalpos.x.end)),
                y: Number(record_id.substring(arcvalpos.y.start, arcvalpos.y.end)),
                radius: Number(record_id.substring(arcvalpos.radius.start, arcvalpos.radius.end)),
                startangle: Number(record_id.substring(arcvalpos.startangle.start, arcvalpos.startangle.end)),
                endangle: Number(record_id.substring(arcvalpos.endangle.start, arcvalpos.endangle.end)),
                counterclockwise: arcvalpos.counterclockwise,
            });
            arcvalpos.x.start += 5;
            arcvalpos.x.end += 5;
            arcvalpos.y.start += 5;
            arcvalpos.y.end += 5;
            arcvalpos.radius.start += 5;
            arcvalpos.radius.end += 5;
            arcvalpos.startangle.start += 5;
            arcvalpos.startangle.end += 5;
            arcvalpos.endangle.start += 5;
            arcvalpos.endangle.end += 5;
        }
        ctx.beginPath();
        rgba_opacity = 0.1;
        for (const a of arcs) {
            ctx.fillStyle = `rgba(${rgbvalinv(record_id.substring(3, 6))}, ${rgbvalinv(record_id.substring(6, 9))}, ${rgbvalinv(record_id.substring(9, 12))}, ${rgba_opacity})`;
            ctx.arc(a.x, a.y, a.radius, a.startangle, a.endangle, (a.startangle < a.endangle) ? true : false);
            ctx.fill();
            rgba_opacity += 0.1;
        }
        ctx.closePath();
        const rects = [];
        let rectvalpos = {
            x: { start: 9, end: 11 },
            y: { start: 11, end: 13 },
            w: { start: 13, end: 15 },
            h: { start: 15, end: 17 },
        };
        for (let c = 0; c < 5; c++) {
            rects.push({
                x: Number(record_id.substring(rectvalpos.x.start, rectvalpos.x.end)),
                y: Number(record_id.substring(rectvalpos.y.start, rectvalpos.y.end)),
                w: Number(record_id.substring(rectvalpos.w.start, rectvalpos.w.end)),
                h: Number(record_id.substring(rectvalpos.h.start, rectvalpos.h.end))
            });
            rectvalpos.x.start += 3;
            rectvalpos.x.end += 3;
            rectvalpos.y.start += 3;
            rectvalpos.y.end += 3;
            rectvalpos.w.start += 3;
            rectvalpos.w.end += 3;
            rectvalpos.h.start += 3;
            rectvalpos.h.end += 3;
        }
        rgba_opacity = 0.2;
        for (const r of rects) {
            ctx.fillStyle = `rgba(${rgbval(record_id.substring(2, 5))}, ${rgbval(record_id.substring(5, 8))}, ${rgbval(record_id.substring(8, 11))}, ${rgba_opacity})`;
            ctx.fillRect(r.x, r.y, r.w, r.h);
            rgba_opacity += 0.1;
        }
        rgba_opacity = 1.0;
        ctx.fillStyle = `rgba(${rgbvalinv(record_id.substring(1, 4))}, ${rgbvalinv(record_id.substring(4, 7))}, ${rgbvalinv(record_id.substring(7, 10))}, ${rgba_opacity})`;
        ctx.font = `${Math.round(canvas.height / 2)}px sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(record_title.substring(0, 3).toUpperCase(), Math.round(canvas.width / 2), Math.round(canvas.height / 2), canvas.width - 15);
        const dataurl = canvas.toDataURL();
        canvas.remove();
        ctx.reset();
        return dataurl;
    }
    catch (boo) {
        console.warn('error while creating coverart:', boo);
        return null;
    }
};
const Fmt = {
    cash: (num) => {
        return num.toFixed(2);
    },
    record: (record, coverart_data = '') => {
        return `
            <img src="${(!coverart_data) ? COVERART_BUFFER[record.id] : coverart_data}" class="cover">
            <strong>${Fmt.discogs_link('release', record.title)}</strong>
            by <strong>${Fmt.discogs_link('artist', record.artist)}</strong>
            <small>(${Fmt.discogs_link('year', record.year)},
                ${Fmt.discogs_link('style', record.style)},
                ${Fmt.discogs_link('format', record.format)},
                <span class="tier_${record.buy_price.tier.tier_level}" data-tooltip="T${record.buy_price.tier.tier_level}: ${record.buy_price.tier.tier_name}">T${record.buy_price.tier.tier_level}</span>)</small>
        `;
    },
    float: (num, precision = 4) => {
        return num.toFixed(precision);
    },
    timestamp: (ms, format = '{year}-{month}-{day} {hours}:{minutes}') => {
        const dt = new Date(ms);
        let ts = format;
        ts = ts.replace('{year}', String(dt.getFullYear()));
        ts = ts.replace('{month}', String(dt.getMonth() + 1).padStart(2, '0'));
        ts = ts.replace('{day}', String(dt.getDate()).padStart(2, '0'));
        ts = ts.replace('{hours}', String(dt.getHours()).padStart(2, '0'));
        ts = ts.replace('{minutes}', String(dt.getMinutes()).padStart(2, '0'));
        ts = ts.replace('{seconds}', String(dt.getSeconds()).padStart(2, '0'));
        return ts;
    },
    duration: (ms, padsec = false) => {
        const sec = Math.max(0, Math.floor(ms / 1000));
        let dur = '';
        const d = Math.floor(sec / 86400);
        const h = Math.floor(sec % 86400 / 3600);
        const m = Math.floor(sec % 3600 / 60);
        const s = Math.floor(sec % 60);
        if (d > 0) {
            dur += `${d}d `;
        }
        if (d || h > 0) {
            dur += `${h}h `;
        }
        if (d || h || m > 0) {
            dur += `${m}m `;
        }
        dur += `${(!padsec) ? s : String(s).padStart(2, '0')}s`;
        return dur;
    },
    percent: (num, precision = 0) => {
        return `${(num * 100).toFixed(precision)}%`;
    },
    discogs_link: (type, query) => {
        query = String(query);
        let url = 'https://www.discogs.com/';
        switch (type) {
            case 'format':
            case 'year':
                url += `search?type=all&${type}=${encodeURIComponent(query)}`;
                break;
            case 'genre':
                url += `search?type=all&genre_exact=${encodeURIComponent(query)}`;
                break;
            case 'style':
                url += `style/${encodeURIComponent(query)}`;
                break;
            default:
                url += `search?type=${type}&q=${encodeURIComponent(query.split(' ')[0] ?? '')}`;
        }
        return `<a href="${url}" target="_blank" class="secondary">${query}</a>`;
    },
};
const Rnd = {
    record_title: () => {
        return Rnd.array_items(MusicAddict3_Data.record_title_words, Rnd.int(1, 4)).join(' ');
    },
    record_format: () => {
        return Rnd.array_item(MusicAddict3_Data.record_formats);
    },
    artist_name: () => {
        return Rnd.array_items(MusicAddict3_Data.artist_name_words, Rnd.int(1, 3)).join(' ');
    },
    music_style: () => {
        return Rnd.array_item(MusicAddict3_Data.music_styles);
    },
    array_item: (arr) => {
        return arr[Math.floor(Math.random() * arr.length)];
    },
    array_items: (arr, item_count) => {
        let items = [];
        while (items.length < item_count) {
            items.push(Rnd.array_item(arr));
        }
        return items;
    },
    array_key: (arr) => {
        return Math.floor(Math.random() * arr.length);
    },
    int: (min, max) => {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1) + min);
    },
    float: (min, max) => {
        return Math.random() * (max - min) + min;
    },
    roll: (win_chance) => {
        win_chance = (win_chance >= 0 && win_chance <= 1) ? win_chance : 0;
        return Math.random() <= win_chance;
    }
};
window.onload = () => {
    setTimeout(() => {
        new MusicAddict3_Engine();
    }, 1000);
};
