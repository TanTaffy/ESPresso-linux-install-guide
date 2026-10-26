Libraries

Each .json file contains one library definition. MSM_CAN is supplied as an ordinary
GitHub library using its latest stable release. You can edit or delete it.

Definitions in this folder are available when creating a new layout. The Libraries
screen can add them to an existing layout and save an edited definition back here
by choosing Save to libraries folder. Existing layouts keep their own definitions.

Copy msm-can.espresso-library.json to create another library. Give it a unique id
and component name, select local or github source, and configure headers and
ESP-IDF dependencies. Local libraries include a files object containing source text.
Use the Libraries editor to import local source folders.

Click Refresh libraries after changing files. Invalid definitions are reported
individually. Default files are installed once; deleted files stay deleted.
