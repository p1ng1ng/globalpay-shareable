# PythonAnywhere Setup - Flat Structure

## 🎯 Your Current Structure

```
/home/v123113456/mysite/
├── flask_app.py
├── app.py
├── routes.py
├── models.py
├── auth.py
├── config.py
├── extensions.py
├── alosheell.py
├── rockypayz.py
├── rupayex.py
├── merchant_webhooks.py
├── gateway_http.py
├── credential_crypto.py
└── ... (all other Python files)
```

**All files are directly in `/home/v123113456/mysite/` with NO subdirectories.**

---

## ✅ Required Changes

### 1. Update ALL Import Statements

Since there's no `backend/` folder, **remove `backend.` from ALL imports** in these files:

#### **flask_app.py**
```python
from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
```

#### **app.py**
Change:
```python
from backend.config import Config
from backend.extensions import db
from backend.models import ...
from backend.routes import api
```

To:
```python
from config import Config
from extensions import db
from models import (
    AuditLog,
    # ... all other models
)
from routes import api
```

#### **routes.py**
Change:
```python
from backend.auth import ...
from backend.extensions import db
from backend.models import ...
from backend.rockypayz import ...
from backend.rupayex import ...
from backend.alosheell import ...
```

To:
```python
from auth import (
    clear_auth_cookies,
    create_token,
    current_user,
    require_roles,
    set_auth_cookies,
    verify_password,
)
from extensions import db
from credential_crypto import CredentialEncryptionError
from merchant_webhooks import (
    MerchantWebhookError,
    callback_signature,
    deliver_callback,
)
from models import (
    AuditLog,
    # ... all other models
)
from rockypayz import (
    RockyPayzError,
    # ... all other imports
)
from rupayex import (
    RupayExError,
    # ... all other imports
)
from alosheell import (
    AlosheellError,
    # ... all other imports
)
```

#### **models.py**
Change:
```python
from backend.extensions import db
```

To:
```python
from extensions import db
```

#### **auth.py**
Change:
```python
from backend.models import Merchant, User
```

To:
```python
from models import Merchant, User
```

#### **alosheell.py, rockypayz.py, rupayex.py**
Change:
```python
from backend.gateway_http import open_gateway_url
```

To:
```python
from gateway_http import open_gateway_url
```

---

## 📝 WSGI Configuration

Update your WSGI file (`/var/www/v123113456_pythonanywhere_com_wsgi.py`):

```python
import sys
import os

# Add mysite directory to Python path
project_home = '/home/v123113456/mysite'

if project_home not in sys.path:
    sys.path.insert(0, project_home)

os.chdir(project_home)

# Import Flask application
from flask_app import app as application
```

---

## 🔧 Quick Fix Commands

Run these in PythonAnywhere Bash console:

```bash
cd /home/v123113456/mysite

# In flask_app.py: Change "from backend.app" to "from app"
sed -i 's/from backend\.app/from app/g' flask_app.py

# In app.py: Remove all "backend." prefixes
sed -i 's/from backend\./from /g' app.py

# In routes.py: Remove all "backend." prefixes
sed -i 's/from backend\./from /g' routes.py

# In models.py: Remove "backend." prefix
sed -i 's/from backend\./from /g' models.py

# In auth.py: Remove "backend." prefix
sed -i 's/from backend\./from /g' auth.py

# In gateway files: Remove "backend." prefix
sed -i 's/from backend\./from /g' alosheell.py
sed -i 's/from backend\./from /g' rockypayz.py
sed -i 's/from backend\./from /g' rupayex.py
```

After running these commands, click **Reload** in the Web tab.

---

## ✅ Verification

Test the import manually:

```bash
cd /home/v123113456/mysite
python3 -c "from app import create_app; print('SUCCESS: Flask app imported')"
```

If this prints "SUCCESS", your app will work!

---

## 🎉 Final Steps

1. Run the `sed` commands above
2. Go to **Web** tab
3. Click **Reload**
4. Visit your site: `https://v123113456.pythonanywhere.com`

---

**The key issue:** You have a flat structure but the code was written for a package structure with `backend/` folder. We need to remove ALL `backend.` prefixes from imports!
