// loop interval timings, will be set overriden on init_game from MusicAddict3_Conf
let GAME_LOOP_INTERVAL: number
let UI_LOOP_INTERVAL: number
let SAVE_LOOP_INTERVAL: number
let AUTHREFRESH_LOOP_INTERVAL: number
let ACTIVEPLAYERS_LOOP_INTERVAL: number

// timeout ids to keep track off
let GAME_LOOP_ID: number = 0
let UI_LOOP_ID: number = 0
let SAVE_LOOP_ID: number = 0
let AUTHREFRESH_LOOP_ID: number = 0



onmessage = (event: MessageEvent) =>
{
    // console.debug('worker got msg', event.data)

    const message: worker_message_data = event.data

    switch (message.cmd)
    {
        case 'init_game':
            GAME_LOOP_INTERVAL = message.payload['conf'].game_loop_interval
            UI_LOOP_INTERVAL = message.payload['conf'].ui_loop_interval
            SAVE_LOOP_INTERVAL = message.payload['conf'].save_loop_interval
            AUTHREFRESH_LOOP_INTERVAL = message.payload['conf'].authrefresh_loop_interval
            break

        case 'init_market':
            ACTIVEPLAYERS_LOOP_INTERVAL = message.payload['conf'].activeplayers_loop_interval
            postMessage({
                cmd: 'activeplayers_loop_tick',
                payload: {},
            } as worker_message_data)
            break

        case 'play':
            plan_next_game_loop_tick()
            plan_next_ui_loop_tick()
            plan_next_save_loop_tick()
            plan_next_authrefresh_loop_tick()
            break

        case 'pause':
            clearTimeout(GAME_LOOP_ID)
            clearTimeout(UI_LOOP_ID)
            clearTimeout(SAVE_LOOP_ID)
            clearTimeout(AUTHREFRESH_LOOP_ID)
            break

        case 'plan_next_game_loop_tick':
            plan_next_game_loop_tick()
            break

        case 'plan_next_ui_loop_tick':
            plan_next_ui_loop_tick()
            break

        case 'plan_next_save_loop_tick':
            plan_next_save_loop_tick()
            break

        case 'plan_next_authrefresh_loop_tick':
            plan_next_authrefresh_loop_tick()
            break

        case 'plan_next_activeplayers_loop_tick':
            plan_next_activeplayers_loop_tick()
            break

        default:
            console.warn('worker got unhandled command:', message.cmd)
    }
}


const plan_next_game_loop_tick = (): void =>
{
    GAME_LOOP_ID = setTimeout(() => {
        postMessage({
            cmd: 'game_loop_tick',
            payload: {},
        } as worker_message_data)
    }, GAME_LOOP_INTERVAL)
}


const plan_next_ui_loop_tick = (): void =>
{
    UI_LOOP_ID = setTimeout(() => {
        postMessage({
            cmd: 'ui_loop_tick',
            payload: {},
        } as worker_message_data)
    }, UI_LOOP_INTERVAL)
}


const plan_next_save_loop_tick = (): void =>
{
    SAVE_LOOP_ID = setTimeout(() => {
        postMessage({
            cmd: 'save_loop_tick',
            payload: {},
        } as worker_message_data)
    }, SAVE_LOOP_INTERVAL)
}


const plan_next_authrefresh_loop_tick = (): void =>
{
    console.debug('plan_next_authrefresh_loop_tick')
    AUTHREFRESH_LOOP_ID = setTimeout(() => {
        postMessage({
            cmd: 'authrefresh_loop_tick',
            payload: {},
        } as worker_message_data)
    }, AUTHREFRESH_LOOP_INTERVAL)
}


const plan_next_activeplayers_loop_tick = (): void =>
{
    setTimeout(() => {
        postMessage({
            cmd: 'activeplayers_loop_tick',
            payload: {},
        } as worker_message_data)
    }, ACTIVEPLAYERS_LOOP_INTERVAL)
}
