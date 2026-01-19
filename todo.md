# Pending Tasks

## 1. Remove Object Restoration Feature
- [x] Backend: Remove `RestoreObjectRequest`, `RestoreObjectResponse`, `ObjectRestoreRequest`, `ObjectRestoreResponse` models.
- [x] Backend: Remove `/restore_object` and `/object_restore` endpoints.
- [x] Backend: Remove `RestoreObjectService` dependency from main app.
- [ ] Frontend: Remove UI components and API calls related to Object Restoration.

## 2. Refactor Services to use SDXL Directly
- [ ] `OverlapSplitService`: Replace `RestoreObjectService` dependency with direct `SdxlInpaintService` usage.
- [ ] `RoiSplitService`: Replace `RestoreObjectService` dependency with direct `SdxlInpaintService` usage.
- [ ] `DecomposeAreaService`: Replace `RestoreObjectService` dependency with direct `SdxlInpaintService` usage.

## 3. Verify System Stability
- [ ] Check backend imports and startup.
- [ ] Verify frontend build.
- [ ] Fix any lingering type errors.

## 4. Frontend Decompose Area UX
- [ ] Implement ROI box selection tool.
- [ ] Add "Decompose Area" button/action.
- [ ] Connect to `/decompose_area` endpoint.
