// node-slate

// Imports
const cleanCss = require('gulp-clean-css');
const concat = require('gulp-concat');
const del = require('del');
const ejs = require('gulp-ejs');
const fs = require('fs');
const gls = require('gulp-live-server');
const gulp = require('gulp');
const gulpIf = require('gulp-if');
const log = require('fancy-log');
const highlight = require('highlight.js');
const htmlHint = require('gulp-htmlhint');
const jsHint = require('gulp-jshint');
const marked = require('marked');
const mergeStream = require('merge-stream');
const open = require('gulp-open');
const prettify = require('gulp-prettify');
const rename = require('gulp-rename');
const sass = require('gulp-sass');
const uglify = require('gulp-uglify');
const w3cHtmlValidator = require('gulp-w3cjs');
const yaml = require('js-yaml');

// Setup
const pkg = require('./package.json');
const port = 4567;
const htmlHintConfig = {
   'attr-value-double-quotes': false,
   "attr-unsafe-chars": true,
   "alt-require": true,
   "tag-pair": true,
};
const jsHintConfig = {
   jquery: true,
   browser: true,
   undef: true,
   unused: true,
};
let compress = true;
const jsFiles = {
   libs: [
      './source/javascripts/lib/_energize.js',
      './source/javascripts/lib/_jquery.js',
      './source/javascripts/lib/_jquery_ui.js',
      './source/javascripts/lib/_jquery.tocify.js',
      './source/javascripts/lib/_imagesloaded.min.js',
   ],
   scripts: [
      './source/javascripts/app/_lang.js',
      './source/javascripts/app/_toc.js',
   ],
   search: [
      './source/javascripts/lib/_lunr.js',
      './source/javascripts/lib/_jquery.highlight.js',
      './source/javascripts/app/_search.js',
   ]
};

// Helper functions
const renderer = new marked.Renderer();
renderer.heading = (text, level) => `<h${level} id="${encodeURIComponent(text)}">${text}</h${level}>`;

renderer.code = (code, language) => {
   const highlighted = language ? highlight.highlight(language, code).value :
      highlight.highlightAuto(code).value;
   return `<pre class="highlight ${language}"><code>${highlighted}</code></pre>`;
};

function readIndexYml() {
   return yaml.safeLoad(fs.readFileSync('./source/index.yml', 'utf8'));
}

function getPageData() {
   const config = readIndexYml();
   const includes = config.includes
      .map((include) => {
         return `./source/includes/${include}.md`;
      })
      .map((include) => {
         return fs.readFileSync(include, 'utf8');
      })
      .map((include) => {
         return marked(include, {
            renderer: renderer
         });
      });
   return {
      current_page: {
         data: config
      },
      page_classes: '',
      includes: includes,
      image_tag: (filename) => {
         const code = filename.split('.')[0];
         return `<img alt=${code} class=image-${code} src=images/${filename}>`;
      },
      javascript_include_tag: (name) => {
         return `<script src=javascripts/${name}.js type=text/javascript></script>\n`;
      },
      stylesheet_link_tag: (name, media) => {
         return `<link href=stylesheets/${name}.css rel=stylesheet media=${media}>`;
      },
      langs: (config.language_tabs || []).map((lang) => {
         return typeof lang == 'string' ? lang : lang.keys.first;
      })
   };
}

// Tasks
const task = {
   clean: () => {
      console.log(pkg.name, 'v' + pkg.version);
      return del(['build/*']);
   },
   runStaticAnalysis: () => {
      function ignoreDuplicateIds(type, message) {
         return !/^Duplicate ID/.test(message);
      }
      return mergeStream(
         gulp.src('build/index.html')
         .pipe(w3cHtmlValidator({
            verifyMessage: ignoreDuplicateIds
         }))
         .pipe(w3cHtmlValidator.reporter())
         .pipe(htmlHint(htmlHintConfig))
         .pipe(htmlHint.reporter()),
         gulp.src(jsFiles.scripts)
         .pipe(jsHint(jsHintConfig))
         .pipe(jsHint.reporter())
      );
   },
   buildFonts: () => {
      return gulp.src('./source/fonts/**/*')
         .pipe(gulp.dest('build/fonts'));
   },
   buildImages: () => {
      return gulp.src('./source/images/**/*')
         .pipe(gulp.dest('build/images'));
   },
   buildJs: () => {
      const config = readIndexYml();
      return gulp.src(jsFiles.libs.concat(config.search ? jsFiles.search : [], jsFiles.scripts))
         .pipe(concat('all.js'))
         .pipe(gulpIf(compress, uglify()))
         .pipe(gulp.dest('./build/javascripts'));
   },
   buildCss: () => {
      return gulp.src('./source/stylesheets/*.css.scss')
         .pipe(sass().on('error', sass.logError))
         .pipe(rename({
            extname: ''
         }))
         .pipe(gulpIf(compress, cleanCss()))
         .pipe(gulp.dest('./build/stylesheets'));
   },
   addHighlightStyle: () => {
      const config = readIndexYml();
      const path = './node_modules/highlight.js/styles/' + config.highlight_theme + '.css';
      return gulp.src(path)
         .pipe(rename({
            prefix: 'highlight-'
         }))
         .pipe(gulpIf(compress, cleanCss()))
         .pipe(gulp.dest('./build/stylesheets'));
   },
   buildHtml: () => {
      const data = getPageData();
      return gulp.src('./source/*.html')
         .pipe(ejs(data).on('error', log.error))
         .pipe(gulpIf(compress, prettify({
            indent_size: 3
         })))
         .pipe(gulp.dest('./build'));
   },
   build: () => {
      return mergeStream(
         task.buildFonts(),
         task.buildImages(),
         task.buildJs(),
         task.buildCss(),
         task.addHighlightStyle(),
         task.buildHtml()
      );
   },
   buildUncompressed: () => {
      compress = false;
      return task.build();
   },
   runServer: () => {
      gulp.watch('./source/*.html', gulp.parallel('build-html'));
      gulp.watch('./source/includes/**/*', gulp.parallel('build-html'));
      gulp.watch('./source/javascripts/**/*', gulp.parallel('build-uncompressed'));
      gulp.watch('./source/stylesheets/**/*', gulp.parallel('build-css'));
      gulp.watch('./source/index.yml', gulp.parallel('build-highlightjs', 'build-uncompressed', 'build-html'));
      const server = gls.static('build', port);
      server.start();

      function notifyServer(file) {
         server.notify.apply(server, [file]);
      }
      gulp.watch('build/**/*', notifyServer);
      gulp.src(__filename).pipe(open({
         uri: 'http://localhost:' + port
      }));
   }
};

// Gulp
gulp.task('clean', task.clean);
gulp.task('lint', task.runStaticAnalysis);
gulp.task('build-js', task.buildJs);
gulp.task('build-css', task.buildCss);
gulp.task('build-html', task.buildHtml);
gulp.task('build-highlightjs', task.addHighlightStyle);
gulp.task('build-static-site', task.build);
gulp.task('build-uncompressed', task.buildUncompressed);
gulp.task('serve', task.runServer);