const vbsBg = `
Dim objPPT
Dim TestFile
Dim opres
Set objPPT = CreateObject("PowerPoint.Application")

Sub Proc(ap)
	Dim sl
	Dim shGroup
	Dim sngWidth
	Dim sngHeight

	For Each sl In ap.Slides
		If sl.SlideShowTransition.Hidden Then
			Set objFileToWrite = CreateObject("Scripting.FileSystemObject").OpenTextFile(Wscript.Arguments.Item(1) & "/hidden.dat",8,true)
			objFileToWrite.WriteLine(sl.SlideIndex)
			objFileToWrite.Close
			Set objFileToWrite = Nothing
		End If
		sl.Export Wscript.Arguments.Item(1) & "/Slide" & sl.SlideIndex & ".png", "PNG"
	Next
End Sub

sub Main()
	objPPT.DisplayAlerts = False
	Set ap = objPPT.Presentations.Open(Wscript.Arguments.Item(0), , , msoFalse)
	Proc(ap)

	For each opres In objPPT.Presentations
		TestFile = opres.FullName
		Exit For
	Next

	If TestFile = "" Then objPPT.Quit
	Set objPPT = Nothing
	Wscript.Echo "PPTNDI: Loaded"
End Sub
Main
`

const vbsNoBg = `
Dim objPPT
Dim TestFile
Dim opres
Set objPPT = CreateObject("PowerPoint.Application")

Sub Proc(ap)
	On Error Resume Next
	Dim sl
	Dim shGroup
	Dim sngWidth
	Dim sngHeight

	With ap.PageSetup
		sngWidth = .SlideWidth
		sngHeight = .SlideHeight
	End With

	For Each sl In ap.Slides
		If sl.SlideShowTransition.Hidden Then
			Set objFileToWrite = CreateObject("Scripting.FileSystemObject").OpenTextFile(Wscript.Arguments.Item(1) & "/hidden.dat",8,true)
			objFileToWrite.WriteLine(sl.SlideIndex)
			objFileToWrite.Close
			Set objFileToWrite = Nothing
		End If

		'For intShape = 1 To sl.Shapes.Count
		'	If sl.Shapes(intShape).Type = 7 Then
		'		sl.Shapes(intShape).Delete
		'	End If
		'Next

		With sl.Shapes.AddTextBox( 1, 0, 0, sngWidth, sngHeight)
		End With

		Set shpGroup = sl.Shapes.Range()
		Dim fn
		fn = Wscript.Arguments.Item(1) & "/Slide" & sl.SlideIndex & ".png"
		shpGroup.Export fn, 2, , , 1
	Next
End Sub

sub Main()
	objPPT.DisplayAlerts = False
	Set ap = objPPT.Presentations.Open(Wscript.Arguments.Item(0), , , msoFalse)
	Proc(ap)

	For each opres In objPPT.Presentations
		TestFile = opres.FullName
		Exit For
	Next

	If TestFile = "" Then objPPT.Quit
	Set objPPT = Nothing
	Wscript.Echo "PPTNDI: Loaded"
End Sub
Main
`;

$(document).ready(function() {
	const spawn = require( 'child_process' ).spawn;
	const { remote } = require('electron');
	const ipc = require('electron').ipcRenderer;
	const fs = require("fs-extra");
	const binPath = './bin/PPTNDI.EXE';
	let maxSlideNum = 0;
	let currentSlide = 1;
	let currentWindow = remote.getCurrentWindow();
	let hiddenSlides = [];
	let blkBool = false;
	let whtBool = false;
	let trnBool = false;
	let numTypBuf = "";
	let tmpDir = "";
	let child;
	let repo;

	if (fs.existsSync(binPath)) {
		child = spawn(binPath);
		child.stdin.setEncoding('utf-8');
		child.stdout.pipe(process.stdout);
		//child.on('exit', function (code) {
		//	alert("EXITED " + code);
		//});
	} else {
		alert('Failed to create a listening server!');
		ipc.send('remote', "exit");
		return;
	}

	function updateScreen() {
		let curSli, nextSli;
		let nextNum;
		let re, rpc;
		if(!repo) {
			return;
		}
		rpc = tmpDir + "/Slide";
		curSli = rpc + currentSlide.toString() + '.png';
		nextNum = currentSlide;
		nextNum++;
		nextSli = rpc + nextNum.toString() + '.png';
		$("select").find('option[value="Current"]').data('img-src', curSli);
		if (!fs.existsSync(nextSli)) {
			nextSli = rpc + '1.png';
		}
		$("select").find('option[value="Next"]').data('img-src', nextSli);
		initImgPicker();
		try {
			child.stdin.write(curSli + "\n");
		} catch(e) {
		}
		$("#slide_cnt").html("SLIDE " + currentSlide + " / " + maxSlideNum);
	}

	$("select").change(function() {
		if (repo == null) {
			repo = $(this);
		}
	});

	$("#with_background").click(function() {
		$("#reloadReq").toggle();
	});

	function initImgPicker() {
		$("select").imagepicker({
			hide_select: true,
			show_label: true,
			selected:function(select, picker_option, event) {
				currentSlide=$('.selected').text();
				updateScreen();
			}
		});
		if ($("#trans_checker").is(":checked")) {
			$("#right img").css('background-image', "url('trans_slide.png')");
		} else {
			$("#right img").css('background-image', "url('null_slide.png')");
		}
	}

	$("#load_pptx").click(function() {
		const {dialog} = require('electron').remote;
		$("#fullblack").show();
		dialog.showOpenDialog(currentWindow,{
			properties: ['openFile'],
			filters: [
				{name: 'PowerPoint Presentations', extensions: ['pptx', 'ppt']},
				{name: 'All Files', extensions: ['*']}
			]
		}, function (file) {
			if (file !== undefined) {
				let re = new RegExp("\\.pptx*\$", "i");
				let vbsDir, res;
				let fileArr = [];
				let options = "";
				if (re.exec(file)) {
					let now = new Date().getTime();
					let newVbsContent;
					let preTmpDir;
					const spawnSync = require( 'child_process' ).spawnSync;
					preTmpDir = tmpDir;
					tmpDir = process.env.TEMP + '/ppt_ndi';
					if (!fs.existsSync(tmpDir)) {
						fs.mkdirSync(tmpDir);
					}
					tmpDir += '/' + now;
					fs.mkdirSync(tmpDir);
					vbsDir = tmpDir + '/wb.vbs';

					if ($("#with_background").is(":checked")) {
						newVbsContent = vbsBg;
					} else {
						newVbsContent = vbsNoBg;
					}
					
					try {
						fs.writeFileSync(vbsDir, newVbsContent, 'utf-8');
					} catch(e) {
						cleanupForTemp();
						tmpDir = preTmpDir;
						alert('Failed to access the temporary directory!');
						$("#fullblack").hide();
						return;
					}
					res = spawnSync( 'cscript.exe', [ vbsDir, file, tmpDir, '' ] );
					$("#fullblack").hide();
					if ( res.status !== 0 ) {
						maxSlideNum = 0;
						cleanupForTemp();
						tmpDir = preTmpDir;
						alert('Failed to parse the presentation!');
						$("#fullblack").hide();
						return;
					}
					maxSlideNum = 0;
					fs.readdirSync(tmpDir).forEach(file2 => {
						re = new RegExp("^Slide(\\d+)\\.png\$", "i");
						if (re.exec(file2)) {
							let rpc = file2.replace(re, "\$1");
							fileArr.push(rpc);
							maxSlideNum++;
						}
					})
					if (fileArr === undefined || fileArr.length == 0) {
						maxSlideNum = 0;
						cleanupForTemp();
						tmpDir = preTmpDir;
						alert("Presentation file could not be loaded.\nPlease remove missing fonts if applicable.");
						$("#fullblack").hide();
						return;
					}

					hiddenSlides = [];
					if (fs.existsSync(tmpDir + "/hidden.dat")) {
						const hs = fs.readFileSync(tmpDir + "/hidden.dat", { encoding: 'utf8' });
						hiddenSlides = hs.split("\n");
					}
					hiddenSlides = hiddenSlides.filter(n => n);
					for (i = 0, len = hiddenSlides.length; i < len; i++) { 
						hiddenSlides[i] = parseInt(hiddenSlides[i], 10);
					}
					fileArr.sort((a, b) => a - b).forEach(file2 => {
						let rpc = file2;
						options += '<option data-img-label="' + rpc + '"';

						for (i = 0, len = hiddenSlides.length; i < len; i++) { 
							let num = hiddenSlides[i];
							if (/^\d+$/.test(num)) {
								if (num == parseInt(rpc, 10)) {
									options += ' data-img-class="hiddenSlide" ';
								}
							}
						}

						options += ' data-img-src="' + tmpDir + '/Slide' + rpc
						+ '.png" value="' + rpc + '">Slide ' + rpc + "\n";
						$("#slides_grp").html(options);
						$("select").find('option[value="Current"]').prop('img-src', tmpDir + "/Slide1.png");
						if (!fs.existsSync(tmpDir + "/Slide2.png")) {
							$("select").find('option[value="Next"]').prop('img-src', tmpDir + "/Slide1.png");
						} else {
							$("select").find('option[value="Next"]').prop('img-src', tmpDir + "/Slide2.png");
						}
					})
					$("#fullblack").hide();
					$("#reloadReq").hide();

					if (hiddenSlides.length == 0 || maxSlideNum == hiddenSlides.length) {
						selectSlide('1');
					} else {
						for (i = 1; i <= maxSlideNum; i++) {
							if (!hiddenSlides.includes(i)) {
								selectSlide(i.toString());
								break;
							}
						}
					}
				} else {
					alert("Only allowed filename extensions are PPT and PPTX.");
					$("#fullblack").hide();
				}
			} else {
				$("#fullblack").hide();
			}
		})
	});

	function selectSlide(num) {
		blkBool = false;
		whtBool = false;
		trnBool = false;
		if (num == 0) {
			return;
		}
		if ( num > maxSlideNum ) {
			num = maxSlideNum;
		}
		$('optgroup[label="Slides"] option[value="' + num.toString() + '"]').prop('selected',true);
		$('optgroup[label="Slides"] option[value="' + num.toString() + '"]').change();
		currentSlide = num;

		let selected = $('.selected:eq( 0 )');
		if (selected.length) {
			$("#below").stop().animate(
			{ scrollTop: selected.position().top + $("#below").scrollTop() },
			  500, 'swing', function() {
			  });
		}

		updateScreen();
	}

	function gotoPrev() {
		let curSli;
		let re;
		if (!repo) {
			return;
		}
		curSli = currentSlide;
		if (hiddenSlides.length == 0 || maxSlideNum == hiddenSlides.length) {
			curSli--;
			if (curSli == 0) {
				curSli = maxSlideNum;
			}
		} else {
			while (true) {
				curSli--;
				if (curSli == 0) {
					curSli = maxSlideNum;
				}
				if (!hiddenSlides.includes(curSli)) {
					break;
				}
			}
		}
		selectSlide(curSli.toString());
	}

	function gotoNext() {
		let curSli;
		let re;
		if (!repo) {
			return;
		}
		curSli = currentSlide;
		if (hiddenSlides.length == 0 || maxSlideNum == hiddenSlides.length) {
			curSli++;
			if (curSli > maxSlideNum) {
				curSli = 1;
			}
		} else {
			while (true) {
				curSli++;
				if (curSli > maxSlideNum) {
					curSli = 1;
				}
				if (!hiddenSlides.includes(curSli)) {
					break;
				}
			}
		}
		selectSlide(curSli.toString());
	}
	
	$('#prev').click(function() {
		gotoPrev();
	});

	$('#next').click(function() {
		gotoNext();
	});

	function updateBlkWhtTrn(color) {
		switch (color) {
			case "black":
				whtBool = false;
				trnBool = false;
				if (blkBool) {
					blkBool = false;
					updateScreen();
					return;
				} else {
					blkBool = true;
				}
				break;
			case "white":
				blkBool = false;
				trnBool = false;
				if (whtBool) {
					whtBool = false;
					updateScreen();
					return;
				} else {
					whtBool = true;
				}
				break;
			case "trn":
				blkBool = false;
				whtBool = false;
				if (trnBool) {
					trnBool = false;
					updateScreen();
					return;
				} else {
					trnBool = true;
				}
				break;
			default:
				break;
		}

		if (color == "trn") {
			color = "null";
		}
		$("select").find('option[value="Current"]').data('img-src', color + "_slide.png");
		initImgPicker();
		try {
			child.stdin.write(__dirname.replace(/app\.asar(\\|\/)frontend/, "") + "/" + color + "_slide.png" + "\n");
		} catch(e) {
		}
	}

	$('#blk').click(function() {
		updateBlkWhtTrn("black");
	});

	$('#wht').click(function() {
		updateBlkWhtTrn("white");
	});

	$('#trn').click(function() {
		updateBlkWhtTrn("trn");
	});

	$(document).keydown(function(e) {
		let realNum = 0;
		$("#below").trigger('click');
		if(e.which >= 48 && e.which <= 57) {
			// 0 through 9
			realNum = e.which - 48;
			numTypBuf += realNum.toString();
		} else if (e.which >= 96 && e.which <= 105) {
			// 0 through 9 (keypad)
			realNum = e.which - 96;
			numTypBuf += realNum.toString();
		} else if (e.which == 13) {
			// Enter
			if (numTypBuf == "") {
				gotoNext();
			} else {
				realNum = parseInt(numTypBuf, 10);
				selectSlide(realNum);
			}
			numTypBuf = "";
		} else if (e.which == 32 || e.which == 39 || e.which == 40 || e.which == 78 || e.which == 34) {
			// Spacebar, right arrow, down, N or page down
			numTypBuf = "";
			gotoNext();
		} else if(e.which == 37 || e.which == 8 || e.which == 38 || e.which == 80 || e.which == 33) {
			// Left arrow, backspace, up, P or page up
			numTypBuf = "";
			gotoPrev();
		} else if(e.which == 36) {
			// Home
			numTypBuf = "";
			if (hiddenSlides.length == 0 || maxSlideNum == hiddenSlides.length) {
				selectSlide('1');
			} else {
				for (i = 1; i <= maxSlideNum; i++) {
					if (!hiddenSlides.includes(i)) {
						selectSlide(i.toString());
						break;
					}
				}
			}
		} else if(e.which == 35) {
			// End
			numTypBuf = "";
			if (hiddenSlides.length == 0 || maxSlideNum == hiddenSlides.length) {
				selectSlide(maxSlideNum.toString());
			} else {
				for (i = maxSlideNum; i >= 1; i--) {
					if (!hiddenSlides.includes(i)) {
						selectSlide(i.toString());
						break;
					}
				}
			}

		} else if(e.which == 66) {
			// B
			numTypBuf = "";
			updateBlkWhtTrn("black");
		} else if(e.which == 84) {
			// T
			numTypBuf = "";
			updateBlkWhtTrn("trn");
		} else if(e.which == 87) {
			// W
			numTypBuf = "";
			updateBlkWhtTrn("white");
		} else if (e.ctrlKey) {
			numTypBuf = "";
			if (e.which == 87) {
				// Prevents Ctrl-W
				e.preventDefault();
				e.stopPropagation();
			}
		}
	});

	$('.button, .checkbox').keydown(function(e){
		if (e.which == 13 || e.which == 32) {
			// Enter or spacebar
			e.preventDefault();
			e.stopPropagation();
			gotoNext();
		}
	});

	function checkTime(i) {
		if (i < 10) {
			i = "0" + i;
		}
		return i;
	}

	function startCurrentTime() {
		let today = new Date();
		let h = today.getHours();
		let m = today.getMinutes();
		let s = today.getSeconds();
		let t;
		m = checkTime(m);
		s = checkTime(s);
		$('#current_time').html(h + ":" + m + ":" + s);
		t = setTimeout(startCurrentTime, 500);
	}

	function cleanupForTemp() {
		if (fs.existsSync(tmpDir)) {
			fs.removeSync(tmpDir);
		}
	}

	function cleanupForExit() {
		try {
			child.stdin.write("destroy\n");
		} catch(e) {
		}
		cleanupForTemp();
		ipc.send('remote', "exit");
	}

	ipc.on('remote' , function(event, data){
		if (data.msg == "exit") {
			cleanupForExit();
		}
	});

	$('#minimize').click(function() {
		remote.BrowserWindow.getFocusedWindow().minimize();
	});

	$('#max_restore').click(function() {
		if(currentWindow.isMaximized()) {
			remote.BrowserWindow.getFocusedWindow().unmaximize();
		} else {
			remote.BrowserWindow.getFocusedWindow().maximize();
		}
	});

	$('#trans_checker').click(function() {
		if ($("#trans_checker").is(":checked")) {
			$("#right img").css('background-image', "url('trans_slide.png')");
		} else {
			$("#right img").css('background-image', "url('null_slide.png')");
		}
	});

	currentWindow.on('maximize', function (){
		$("#max_restore").attr("src", "restore.png");
    });

	currentWindow.on('unmaximize', function (){
		$("#max_restore").attr("src", "max.png");
    });
	
	$('#exit').click(function() {
		cleanupForExit();
	});

	document.addEventListener('dragover',function(event){
		event.preventDefault();
		return false;
	},false);
	
	document.addEventListener('drop',function(event){
		event.preventDefault();
		return false;
	},false);

	window.addEventListener("keydown", function(e) {
		if([32, 37, 38, 39, 40].indexOf(e.keyCode) > -1) {
			e.preventDefault();
		}
	}, false);

	initImgPicker();
	startCurrentTime();
});