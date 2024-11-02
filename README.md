# Music Addict 3

Music Addict 3 is a free-to-play idle game that can be played in a webbrowser.

[Demo video](https://www.youtube.com/watch?v=wiwzTSNTSZQ)




## Usage Requirements

- Internet connection.
- Webbrowser supporting [ES2022](https://caniuse.com/sr_es13) (most modern webbrowsers except some stupid ones will do).
- Minimum screen width ~400px.




## How To Play

1. Open [https://etrusci.org/play/musicaddict3](https://etrusci.org/play/musicaddict3) in a webbrowser.
2. Register an account.
3. Once logged in, click **play**.
4. *?*
5. Profit!

The progress data is stored on the server and tied to the account you register.  
This allows you to resume the game on different devices.  
**Note**: Because no email is required, there is also **no way to reset a forgotten password**.




## Special Thanks To

**[Discogs](https://discogs.com)**: For providing data dumps. Used to generate random records.

**[Intro GIF](./src/vendor/unknown/intro.gif)**: Whoever created it. Used in the intro story.

**The developers** of the tools used to create this game, see **Development / Tools** below.


## Development

### Self-Hosting

1. Install and run a PocketBase instance.
2. Adjust `MusicAddict3_Conf.db_url` in [src/musicaddict3.mts](./src/musicaddict3.mts) so it points to your server and then run `tsc -p ./tsconfig.json` to compile that file to JavaScript. If you don't plan to develop it further, you can also adjust `MusicAddict3_Conf.db_url` directly in [app/lib/musicaddict3.mjs](./app/lib/musicaddict3.mjs), no need to compile then.
3. Upload the contents of the [app/](./app) directory to your webserver.
4. Open <https://yourserver.org/path-to-app-contents/>

### Tools

- [PocketBase](https://github.com/pocketbase/pocketbase)
- [Typescript](https://github.com/microsoft/TypeScript)
- [PicoCSS](https://github.com/picocss/pico)
- [SASS](https://github.com/sass/sass)
- [CSSO](https://github.com/css/csso)

The following commands are meant to be run from within the root directory of this repository.

**Run local PocketBase server**:  
On first run, open [admin page](http://127.0.0.1:8090/_/) and create admin account.  
Then import collections from [src/pb_schema.json](./src/pb_schema.json).
```bash
./db/pocketbase serve
```

**Compile Typescript to JavaScript**:
```bash
tsc --watch -p ./tsconfig.json
```

**Compile SASS to CSS**:
```bash
sass --watch --update --no-source-map --style expanded --charset --load-path ./src/vendor/pico/2.0.6/scss ./src/musicaddict3.scss:./src/musicaddict3-compiled.css
```

**Optimize/minify CSS**:
```bash
csso --watch --stat --comments none --input-source-map none --source-map none --input ./src/musicaddict3-compiled.css --output ./app/lib/musicaddict3.min.css
```


## License

Music Addict 3  
Copyright 2024 arT2 (<https://etrusci.org>) - Licensed under The MIT License  
See the [LICENSE.md](./LICENSE.md) file for details.
