let GAME_LOOP_INTERVAL;
let UI_LOOP_INTERVAL;
let SAVE_LOOP_INTERVAL;
let AUTHREFRESH_LOOP_INTERVAL;
let ACTIVEPLAYERS_LOOP_INTERVAL;
let GAME_LOOP_ID = 0;
let UI_LOOP_ID = 0;
let SAVE_LOOP_ID = 0;
let AUTHREFRESH_LOOP_ID = 0;
onmessage = (event) => {
    const message = event.data;
    switch (message.cmd) {
        case 'init_game':
            GAME_LOOP_INTERVAL = message.payload['conf'].game_loop_interval;
            UI_LOOP_INTERVAL = message.payload['conf'].ui_loop_interval;
            SAVE_LOOP_INTERVAL = message.payload['conf'].save_loop_interval;
            AUTHREFRESH_LOOP_INTERVAL = message.payload['conf'].authrefresh_loop_interval;
            break;
        case 'init_market':
            ACTIVEPLAYERS_LOOP_INTERVAL = message.payload['conf'].activeplayers_loop_interval;
            postMessage({
                cmd: 'activeplayers_loop_tick',
                payload: {},
            });
            break;
        case 'play':
            plan_next_game_loop_tick();
            plan_next_ui_loop_tick();
            plan_next_save_loop_tick();
            plan_next_authrefresh_loop_tick();
            break;
        case 'pause':
            clearTimeout(GAME_LOOP_ID);
            clearTimeout(UI_LOOP_ID);
            clearTimeout(SAVE_LOOP_ID);
            clearTimeout(AUTHREFRESH_LOOP_ID);
            break;
        case 'plan_next_game_loop_tick':
            plan_next_game_loop_tick();
            break;
        case 'plan_next_ui_loop_tick':
            plan_next_ui_loop_tick();
            break;
        case 'plan_next_save_loop_tick':
            plan_next_save_loop_tick();
            break;
        case 'plan_next_authrefresh_loop_tick':
            plan_next_authrefresh_loop_tick();
            break;
        case 'plan_next_activeplayers_loop_tick':
            plan_next_activeplayers_loop_tick();
            break;
        default:
            console.warn('worker got unhandled command:', message.cmd);
    }
};
const plan_next_game_loop_tick = () => {
    GAME_LOOP_ID = setTimeout(() => {
        postMessage({
            cmd: 'game_loop_tick',
            payload: {},
        });
    }, GAME_LOOP_INTERVAL);
};
const plan_next_ui_loop_tick = () => {
    UI_LOOP_ID = setTimeout(() => {
        postMessage({
            cmd: 'ui_loop_tick',
            payload: {},
        });
    }, UI_LOOP_INTERVAL);
};
const plan_next_save_loop_tick = () => {
    SAVE_LOOP_ID = setTimeout(() => {
        postMessage({
            cmd: 'save_loop_tick',
            payload: {},
        });
    }, SAVE_LOOP_INTERVAL);
};
const plan_next_authrefresh_loop_tick = () => {
    AUTHREFRESH_LOOP_ID = setTimeout(() => {
        postMessage({
            cmd: 'authrefresh_loop_tick',
            payload: {},
        });
    }, AUTHREFRESH_LOOP_INTERVAL);
};
const plan_next_activeplayers_loop_tick = () => {
    setTimeout(() => {
        postMessage({
            cmd: 'activeplayers_loop_tick',
            payload: {},
        });
    }, ACTIVEPLAYERS_LOOP_INTERVAL);
};
export {};
