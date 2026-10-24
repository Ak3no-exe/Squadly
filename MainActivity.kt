package com.gametrack.app

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.pm.PackageInfoCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private var fileCb: ValueCallback<Array<Uri>>? = null

    // Sélecteur de fichiers (galerie) pour les clips vidéo
    private val picker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        fileCb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
        fileCb = null
    }

    // Donne la version installée à la page (window.GameTrackApp.getConfig())
    inner class Bridge {
        @JavascriptInterface
        fun getConfig(): String {
            val p = packageManager.getPackageInfo(packageName, 0)
            return JSONObject()
                .put("versionName", p.versionName ?: "")
                .put("versionCode", PackageInfoCompat.getLongVersionCode(p))
                .toString()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        web.addJavascriptInterface(Bridge(), "GameTrackApp")

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == "appassets.androidplatform.net") return false
                if (u.path?.endsWith(".apk", ignoreCase = true) == true) {
                    downloadApk(u.toString(), web.settings.userAgentString)
                    return true
                }
                try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: Exception) {}
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                w: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams
            ): Boolean {
                fileCb?.onReceiveValue(null)
                fileCb = cb
                return try {
                    picker.launch(params.createIntent())
                    true
                } catch (_: Exception) {
                    fileCb = null
                    false
                }
            }
        }

        // Filet de sécurité : tout téléchargement d'APK passe par le même chemin
        web.setDownloadListener { url, ua, cd, mime, _ ->
            if (url.contains(".apk", true) || (cd ?: "").contains(".apk", true) || mime == APK) {
                downloadApk(url, ua)
            }
        }

        web.loadUrl("https://appassets.androidplatform.net/assets/index.html")
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()

    // Télécharge l'APK puis ouvre l'installateur d'Android
    private fun downloadApk(url: String, ua: String?) {
        val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val req = DownloadManager.Request(Uri.parse(url))
            .setMimeType(APK)
            .setTitle("GameTrack")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "GameTrack.apk")
        if (ua != null) req.addRequestHeader("User-Agent", ua)
        val id = dm.enqueue(req)
        toast("Téléchargement de la mise à jour…")

        val rx = object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) {
                if (i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) != id) return
                unregisterReceiver(this)
                val uri = dm.getUriForDownloadedFile(id)
                if (uri == null) { toast("Téléchargement de l'appli échoué"); return }
                try {
                    startActivity(
                        Intent(Intent.ACTION_VIEW)
                            .setDataAndType(uri, APK)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                } catch (_: Exception) {
                    toast("Ouvre GameTrack.apk dans tes Téléchargements pour l'installer")
                }
            }
        }
        ContextCompat.registerReceiver(
            this, rx, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED
        )
    }

    companion object { const val APK = "application/vnd.android.package-archive" }
}
