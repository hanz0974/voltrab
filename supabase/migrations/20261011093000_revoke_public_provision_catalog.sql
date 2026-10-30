-- provision_component_catalog(p_user_id) adalah SECURITY DEFINER dan sebelumnya dapat dipanggil
-- oleh anon/authenticated lewat /rest/v1/rpc, sehingga siapa pun dapat mengisi katalog ke akun
-- pengguna lain. Fungsi ini hanya perlu dipanggil oleh trigger pendaftaran pengguna baru.
REVOKE EXECUTE ON FUNCTION public.provision_component_catalog(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_component_catalog() FROM PUBLIC, anon, authenticated;
