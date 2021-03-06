'use strict';

/**
 * Module dependencies
 */
var _ = require('lodash'),
	defaultAssets = require('./config/assets/default'),
	testAssets = require('./config/assets/test'),
	gulp = require('gulp'),
	gulpLoadPlugins = require('gulp-load-plugins'),
	runSequence = require('run-sequence'),
	plugins = gulpLoadPlugins(),
	args = require('get-gulp-args')();

// Set NODE_ENV to 'test'
gulp.task('env:test', function () {
	process.env.NODE_ENV = 'test';
});

// Set NODE_ENV to 'development'
gulp.task('env:dev', function () {
	process.env.NODE_ENV = 'development';
});

// Set NODE_ENV to 'production'
gulp.task('env:prod', function () {
	process.env.NODE_ENV = 'production';
});

// Set NODE_ENV to 'stage'
gulp.task('env:stage', function () {
	process.env.NODE_ENV = 'stage';
});

// Set DEBUG environment variables
gulp.task('env:DEBUG', function () {
    console.log('debug');
    process.env.DEBUG = 'express:*';
})

// Nodemon task
gulp.task('nodemon', function () {
	return plugins.nodemon({
		script: 'server.js',
		nodeArgs: ['--debug'],
		ext: 'js,html',
		watch: _.union(defaultAssets.server.views, defaultAssets.server.allJS, defaultAssets.server.config)
	});
});

gulp.task('node', function () {
    var nodeArgs = ['server.js'];
    var spawn = require('child_process').spawn;
    
    _(['stack-size', 'debug', 'max_old_space_size'])
        .forEach(function(k) {
            var sk = 'spawn_' + k;
            if (!_.has(args,sk)) { return; }
            if (typeof(args[sk]) !== 'undefined') {nodeArgs.push( '--' + k + '=' + args[sk] );}
            else {nodeArgs.push('--' + k);}
        });
    console.log('spawning: node',nodeArgs);
    spawn('node', nodeArgs, {stdio: 'inherit'}); 
});

// Watch Files For Changes
gulp.task('watch', function() {
	// Start livereload
	plugins.livereload.listen();

	// Add watch rules
	gulp.watch(defaultAssets.server.views).on('change', plugins.livereload.changed);
	gulp.watch(defaultAssets.server.allJS, ['jshint']).on('change', plugins.livereload.changed);
	gulp.watch(defaultAssets.client.views).on('change', plugins.livereload.changed);
	gulp.watch(defaultAssets.client.js, ['jshint']).on('change', plugins.livereload.changed);
	gulp.watch(defaultAssets.client.css, ['csslint']).on('change', plugins.livereload.changed);
	gulp.watch(defaultAssets.client.less, ['less', 'csslint']).on('change', plugins.livereload.changed);
});

// CSS linting task
gulp.task('csslint', function (done) {
	return gulp.src(defaultAssets.client.css)
		.pipe(plugins.csslint('.csslintrc'))
		.pipe(plugins.csslint.formatter())
		.pipe(plugins.csslint.formatter('fail'));
});

// JS linting task
gulp.task('jshint', function () {
	return gulp.src(_.union(defaultAssets.server.allJS, defaultAssets.client.js, testAssets.tests.server, testAssets.tests.client, testAssets.tests.e2e))
		.pipe(plugins.jshint())
		.pipe(plugins.jshint.reporter('default'))
		.pipe(plugins.jshint.reporter('fail'));
});

// JS minifying task
gulp.task('uglify', function () {
	return gulp.src(defaultAssets.client.js)
		.pipe(plugins.ngAnnotate())
		.pipe(plugins.uglify({
			mangle: false
		}))
		.pipe(plugins.concat('application.min.js'))
		.pipe(gulp.dest('public/dist'));
});

// CSS minifying task
gulp.task('cssmin', function () {
	return gulp.src(defaultAssets.client.css)
		.pipe(plugins.cssmin())
		.pipe(plugins.concat('application.min.css'))
		.pipe(gulp.dest('public/dist'));
});

// Less task
gulp.task('less', function () {
	return gulp.src(defaultAssets.client.less)
		.pipe(plugins.less())
		.pipe(plugins.rename(function (path) {
			path.dirname = path.dirname.replace('/less', '/css');
		}))
		.pipe(gulp.dest('./modules/'));
});

// Build clients from RAML
gulp.task("generate-clients", function(){
    var raml2code = require('raml2code');
    var genJS = require("raml2code-js-client-mulesoft");
    var lastJS;
    gulp.src(defaultAssets.server.raml)  
        .pipe(raml2code({generator: genJS, extra: {}}))
        .pipe(plugins.rename(function (path) {
            if (path.extname === '.js') {
                lastJS = path.basename;
            } 
            else {
                path.basename = lastJS + path.basename; 
            }
		}))
        .pipe(gulp.dest('config/dist/'));
});

// Mocha tests task
gulp.task('mocha', function (done) {
	// Open mongoose connections
	var mongoose = require('./config/lib/mongoose.js');
	var already;

	// Connect mongoose
	mongoose.connect(function() {
		// Run the tests
		gulp.src(testAssets.tests.server)
			.pipe(plugins.mocha({
				reporter: 'spec',
				timeout: 4000
			}))
			.on('error', function (err) {
				// If an error occurs, save it
				already = true;
				done(err);
			})
			.on('end', function (err) {
				// When the tests are done, disconnect mongoose and pass the error state back to gulp
				mongoose.disconnect(function() {
					if (!already) {
					    done(err);
					}
				});
			});
	});

});

// Running karma from a docker container as we do on drone
gulp.task('karma', function (done) {
    var spawn = require('child_process').spawn;

    return spawn('docker', [
        'run', '--rm', '-v', __dirname + ':/home/src', 'newcrossfoodcoop/nxfc_karma', 
        'gulp', 'karma', '--conf=/home/src/karma.conf.js'
    ], {stdio: 'inherit'});
})

// Lint CSS and JavaScript files.
gulp.task('lint', function(done) {
	runSequence('less', ['csslint', 'jshint'], done);
});

// Lint project files and minify them into two production files.
gulp.task('build', function(done) {
	runSequence('env:dev' ,'lint', ['uglify', 'cssmin'], 'generate-clients', done);
});

// Run the project tests
gulp.task('drone:test', function(done) {
	runSequence('env:test', 'lint', 'mocha', done);
});

// Run the project tests
gulp.task('test', function(done) {
	runSequence('drone:test', 'karma', done);
});

// Run the project in development mode
gulp.task('default', function(done) {
	runSequence('env:dev', 'lint', ['nodemon', 'watch'], done);
});

// Run the project in debug mode
gulp.task('debug', function(done) {
	runSequence('env:dev', 'env:DEBUG', 'lint', ['nodemon', 'watch'], done);
});

// Run the project in production mode
gulp.task('prod', function(done) {
	runSequence('env:prod', 'node', done);
});

// Run the project in stage mode
gulp.task('stage', function(done) {
	runSequence('env:stage', 'node', done);
});


