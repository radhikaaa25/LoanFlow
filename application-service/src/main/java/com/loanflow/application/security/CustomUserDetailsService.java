package com.loanflow.application.security;

import com.loanflow.application.repository.ApplicantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService {

    private final ApplicantRepository applicantRepository;

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        return applicantRepository.findByEmail(email)
                .map(applicant -> new org.springframework.security.core.userdetails.User(
                        applicant.getEmail(),
                        applicant.getPasswordHash(),
                        List.of(new SimpleGrantedAuthority("ROLE_" + applicant.getRole().name()))
                ))
                .orElseThrow(() -> new UsernameNotFoundException("User not found with email: " + email));
    }
}
