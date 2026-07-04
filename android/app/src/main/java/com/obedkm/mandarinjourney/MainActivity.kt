package com.obedkm.mandarinjourney

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.util.Locale

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var recognizer: SpeechRecognizer? = null
    private var pendingLang: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.language = Locale.SIMPLIFIED_CHINESE
                ttsReady = true
            }
        }

        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true   // localStorage — all progress lives here
        webView.settings.allowFileAccess = true     // required for file:// assets on targetSdk 30+
        webView.webViewClient = WebViewClient()
        webView.addJavascriptInterface(Bridge(), "MJBridge")
        webView.loadUrl("file:///android_asset/www/index.html")
        setContentView(webView)
    }

    inner class Bridge {
        @JavascriptInterface
        fun speak(text: String, rate: Double) {
            if (!ttsReady) return
            tts?.setSpeechRate(rate.toFloat())
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "mj-utterance")
        }

        @JavascriptInterface
        fun startListening(lang: String) {
            runOnUiThread {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    pendingLang = lang
                    requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
                } else {
                    doListen(lang)
                }
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val lang = pendingLang ?: return
        pendingLang = null
        if (requestCode == 1 && grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            doListen(lang)
        } else {
            sendSpeechResult("")
        }
    }

    private fun doListen(lang: String) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            sendSpeechResult("")
            return
        }
        recognizer?.destroy()
        recognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle?) {
                    val texts = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    sendSpeechResult(texts?.firstOrNull() ?: "")
                }
                override fun onError(error: Int) = sendSpeechResult("")
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onPartialResults(partialResults: Bundle?) {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }
        recognizer?.startListening(intent)
    }

    private fun sendSpeechResult(text: String) {
        runOnUiThread {
            webView.evaluateJavascript("window._mjOnSpeech && window._mjOnSpeech(${JSONObject.quote(text)})", null)
        }
    }

    override fun onBackPressed() {
        // Keep the app single-screen; back exits (progress is saved continuously)
        super.onBackPressed()
    }

    override fun onDestroy() {
        tts?.shutdown()
        recognizer?.destroy()
        super.onDestroy()
    }
}
