package velvet.app;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            View webView = getBridge().getWebView();
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getWindow().getDecorView());
            if (insets != null) {
                int topInset = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
                if (topInset > 0 && webView.getLayoutParams() instanceof ViewGroup.MarginLayoutParams) {
                    ViewGroup.MarginLayoutParams params = (ViewGroup.MarginLayoutParams) webView.getLayoutParams();
                    params.topMargin = topInset;
                    webView.setLayoutParams(params);
                    getWindow().getDecorView().setBackgroundColor(0xFF000000);
                }
            }
        }
    }
}
